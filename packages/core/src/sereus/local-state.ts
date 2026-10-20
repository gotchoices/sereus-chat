/**
 * Device-local state: this device's alone, never strand data, never replicated
 * (design/specs/domain/ops.md). Each record is JSON in one host slot, and every read
 * normalises what it finds — the slots were written by older builds, and a corrupt
 * blob must not brick a screen.
 */
import type { Invitation, Muted, Prefs, Profile, StrandSummary } from '../model/index.js';
import type { ChatHost, DurableSlot } from './host.js';

async function readJson(slot: DurableSlot): Promise<unknown> {
  try {
    const raw = await slot.load();
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

// ── Per-strand settings (story 33: mute and archive) ─────────────────────────────

export type StrandPrefs = { muted: Muted; archived: boolean };
const STRAND_PREFS_DEFAULTS: StrandPrefs = { muted: 'none', archived: false };

/**
 * Story 33: Mute — "he stays in the strand and his machines carry on taking part;
 * he simply is not told", `soft` unless somebody names him, `hard` whatever happens.
 * Archive — "hide it from your list; nothing changes for anyone else". Neither is
 * leaving.
 */
export class StrandPrefsStore {
  constructor(private readonly host: ChatHost) {}
  private get slot() { return this.host.slot('strandPrefs'); }

  async all(): Promise<Record<string, StrandPrefs>> {
    const parsed = await readJson(this.slot);
    if (!isRecord(parsed)) return {};
    const out: Record<string, StrandPrefs> = {};
    for (const [id, value] of Object.entries(parsed)) {
      const v = isRecord(value) ? value : {};
      out[id] = {
        // A bad value would reach the UI as a mute mode nothing handles.
        muted: v.muted === 'soft' || v.muted === 'hard' ? v.muted : 'none',
        archived: v.archived === true,
      };
    }
    return out;
  }

  async get(strandId: string): Promise<StrandPrefs> {
    return (await this.all())[strandId] ?? STRAND_PREFS_DEFAULTS;
  }

  async patch(strandId: string, change: Partial<StrandPrefs>): Promise<void> {
    const all = await this.all();
    all[strandId] = { ...(all[strandId] ?? STRAND_PREFS_DEFAULTS), ...change };
    await this.slot.save(JSON.stringify(all));
  }

  /** For a strand being forgotten, so a later re-join does not inherit an old mute. */
  async clear(strandId: string): Promise<void> {
    const all = await this.all();
    delete all[strandId];
    await this.slot.save(JSON.stringify(all));
  }
}

// ── The strand list as it last stood ─────────────────────────────────────────────

/** What is worth showing before a strand opens; the rest is recomputed when it does. */
export type CachedSummary = Pick<StrandSummary, 'id' | 'title' | 'avatarUri' | 'isGroup' | 'memberCount' | 'lastMessage'>;

/**
 * After a cold start a strand is listed only once its database opens, and a strand
 * joined from another party re-attaches last — about 2 minutes on two phones, with the
 * list saying "No strands yet" all the while. So each open strand's row is kept here
 * and a strand known but not open yet is shown from it, marked as connecting.
 * Disposable: losing it costs only that early view.
 */
export class SummaryCache {
  constructor(private readonly host: ChatHost) {}
  private get slot() { return this.host.slot('strandSummaries'); }

  async read(): Promise<Record<string, CachedSummary>> {
    const parsed = await readJson(this.slot);
    return isRecord(parsed) ? (parsed as Record<string, CachedSummary>) : {};
  }

  /** Save the rows of every strand open now; strands not in `rows` are kept. */
  async save(rows: StrandSummary[]): Promise<void> {
    if (!rows.length) return;
    const all = await this.read();
    const before = JSON.stringify(all);
    for (const s of rows) {
      all[s.id] = {
        id: s.id, title: s.title, avatarUri: s.avatarUri ?? null,
        isGroup: s.isGroup, memberCount: s.memberCount, lastMessage: s.lastMessage ?? null,
      };
    }
    const after = JSON.stringify(all);
    if (after === before) return; // most refreshes change nothing
    try { await this.slot.save(after); } catch { /* disposable */ }
  }

  /** A strand left on purpose must not come back as a "connecting" row. */
  async forget(strandId: string): Promise<void> {
    const all = await this.read();
    if (!(strandId in all)) return;
    delete all[strandId];
    try { await this.slot.save(JSON.stringify(all)); } catch { /* disposable */ }
  }
}

// ── Invitations this device handed out ───────────────────────────────────────────

export type OutgoingInvitation = Invitation & {
  /** Members in the strand when this invitation was made. */
  membersAtMint: number;
  /** When it was made, ISO. */
  createdAt: string;
};

/**
 * An invitation's redeemability lives in a `FormationInvite` row keyed by its RAW
 * token; the ENCODED invitation that is shared is not recoverable from it. So only the
 * minting device can re-share one (story 02 path D), and this is where it keeps them.
 * Forgetting one stops listing it; it does not withdraw it (cadre-core exposes no
 * call for that yet).
 */
export class OutgoingInvitations {
  constructor(private readonly host: ChatHost) {}
  private get slot() { return this.host.slot('outgoingInvitations'); }

  private async load(): Promise<OutgoingInvitation[]> {
    const parsed = await readJson(this.slot);
    return Array.isArray(parsed) ? (parsed as OutgoingInvitation[]) : [];
  }
  private async store(list: OutgoingInvitation[]): Promise<void> {
    await this.slot.save(JSON.stringify(list));
  }

  async remember(inv: OutgoingInvitation): Promise<void> {
    const list = await this.load();
    await this.store([...list.filter(i => i.id !== inv.id), inv]);
  }

  async forget(id: string): Promise<void> {
    await this.store((await this.load()).filter(i => i.id !== id));
  }

  /**
   * Still-outstanding invitations, newest first; expired and spent ones are dropped
   * from the slot too. `usage` is how many joined through one (null when the control
   * database cannot be read). A one-person invitation is spent at its first use; one
   * for anyone stays until it expires, with its count. With no usage, a one-person
   * invitation falls back to the strand's member count at mint time.
   */
  async list(
    usage: (inv: OutgoingInvitation) => Promise<number | null>,
    memberCount: (strandId: string) => Promise<number | null>,
  ): Promise<OutgoingInvitation[]> {
    const list = await this.load();
    const now = Date.now();
    const keep: OutgoingInvitation[] = [];
    for (const inv of list) {
      if (inv.expiresAt && Date.parse(inv.expiresAt) <= now) continue;
      const singleUse = inv.singleUse ?? true; // older builds: one-person
      const used = await usage(inv);
      if (singleUse) {
        if (used !== null && used > 0) continue;
        if (used === null && inv.strandId) {
          const count = await memberCount(inv.strandId);
          if (count !== null && count > inv.membersAtMint) continue;
        }
        keep.push(inv);
      } else {
        keep.push(used === null ? inv : { ...inv, uses: used });
      }
    }
    const stored = keep.map(({ uses: _uses, ...rest }) => rest as OutgoingInvitation);
    if (stored.length !== list.length) await this.store(stored);
    return keep.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}

// ── Strands joined through someone else's invitation ─────────────────────────────

/**
 * Exactly what `addStrand` needs to re-attach a joined strand. `FounderOwnerKey` is null:
 * a consent-seated row records no trustworthy founding signer.
 */
export type JoinedStrand = {
  Id: string;
  MemberPrivateKey: string | null;
  Type: 'c' | 'o';
  FounderOwnerKey: null;
  /** Null on a consent-seated row, which every joined strand is (sereus 1.17 `StrandRow`). */
  FounderPeerId: null;
  /** Left with the membership key kept (story 33): never re-attached on its own. */
  Left?: boolean;
};

/**
 * Kept for MIGRATION and safety: `MemberPrivateKey` is a closed strand's read-gating
 * secret, handed over once at formation and written to neither side's control
 * database. Since cadre-core 1.7 the node also records joins itself (`joinedStrands`
 * store) and re-offers them; joins made before that live only here.
 */
export class JoinedStrands {
  constructor(private readonly host: ChatHost) {}
  private get slot() { return this.host.slot('joinedStrands'); }

  async read(): Promise<JoinedStrand[]> {
    const parsed = await readJson(this.slot);
    if (!Array.isArray(parsed)) return [];
    // NORMALISED, not cast: older builds wrote entries without every field.
    return parsed
      .filter((row): row is Record<string, unknown> => isRecord(row) && typeof row.Id === 'string')
      .map(row => ({
        Id: row.Id as string,
        MemberPrivateKey: typeof row.MemberPrivateKey === 'string' ? row.MemberPrivateKey : null,
        Type: row.Type === 'o' ? 'o' as const : 'c' as const,
        FounderOwnerKey: null,
        FounderPeerId: null,
        Left: row.Left === true,
      }));
  }

  async write(list: JoinedStrand[]): Promise<void> {
    await this.slot.save(JSON.stringify(list));
  }

  async remember(row: JoinedStrand): Promise<void> {
    const list = await this.read();
    await this.write([...list.filter(s => s.Id !== row.Id), row]);
  }
}

// ── Profile, prefs, drafts, read cursors ─────────────────────────────────────────

export const DEFAULT_PREFS: Omit<Prefs, 'relayAddrs'> = {
  theme: 'system', language: 'en', notifyDefault: 'all', storageCeilingBytes: null, perStrandOverrides: 0,
};

export class LocalRecords {
  constructor(private readonly host: ChatHost) {}

  async profile(): Promise<Profile> {
    const parsed = await readJson(this.host.slot('profile'));
    return isRecord(parsed) && typeof parsed.name === 'string' ? (parsed as Profile) : { name: '' };
  }
  async saveProfile(profile: Profile): Promise<void> {
    await this.host.slot('profile').save(JSON.stringify(profile));
  }

  /** Stored prefs. Relays are never stored here: they are the node's start options. */
  async prefs(): Promise<Omit<Prefs, 'relayAddrs'>> {
    const parsed = await readJson(this.host.slot('prefs'));
    const { relayAddrs: _stale, ...stored } = isRecord(parsed) ? parsed : {};
    return { ...DEFAULT_PREFS, ...stored } as Omit<Prefs, 'relayAddrs'>;
  }
  async savePrefs(prefs: Omit<Prefs, 'relayAddrs'>): Promise<void> {
    await this.host.slot('prefs').save(JSON.stringify(prefs));
  }

  async draft(strandId: string): Promise<string> {
    try { return (await this.host.slot('draft', strandId).load()) ?? ''; } catch { return ''; }
  }
  async saveDraft(strandId: string, text: string): Promise<void> {
    await this.host.slot('draft', strandId).save(text);
  }

  async readCursor(strandId: string): Promise<string | null> {
    try { return (await this.host.slot('readCursor', strandId).load()) || null; } catch { return null; }
  }
  async saveReadCursor(strandId: string, messageId: string): Promise<void> {
    await this.host.slot('readCursor', strandId).save(messageId);
  }
}
