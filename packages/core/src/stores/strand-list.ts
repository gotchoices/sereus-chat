/**
 * The strand list: every strand, the user's outstanding invitations counted per strand,
 * member names for narrowing, and whether start-up is still settling or has failed.
 */
import type { ChatModel, StrandSummary } from '../model/index.js';
import { ok } from '../model/index.js';
import { loader, type Loader } from './loader.js';

export type StrandList = {
  strands: StrandSummary[];
  /** The user's own outstanding invitations, counted per strand (story 31 1a). */
  invitationsOut: Record<string, number>;
  /** Member names per strand, so narrowing can match "the group with Priya in it". */
  memberNames: Record<string, string[]>;
  /** The node is still bringing strands up: an empty list means "not asked yet". */
  settling: boolean;
  /** Why start-up failed, or null — a failed start must not look like a slow one. */
  bootError: string | null;
};

export type StrandSort = 'recent' | 'alpha' | 'unread';

/**
 * The list's order. Muted strands are not promoted by ordinary traffic; being NAMED is
 * not ordinary traffic, so a soft mute lets a mention surface the row. A hard mute stays
 * put whatever happens.
 */
export function sortStrands(strands: StrandSummary[], mode: StrandSort): StrandSummary[] {
  return [...strands].sort((a, b) => {
    if (mode === 'alpha') return a.title.localeCompare(b.title);
    if (mode === 'unread') {
      const av = a.mentioned ? 1e9 : a.unreadCount;
      const bv = b.mentioned ? 1e9 : b.unreadCount;
      return bv - av || a.title.localeCompare(b.title);
    }
    const rank = (x: StrandSummary) =>
      x.muted === 'hard' ? 0 : x.mentioned || x.muted === 'none' ? Date.parse(x.lastMessage?.timestamp ?? '0') : 0;
    return rank(b) - rank(a);
  });
}

/** Narrowing: a string match over names already held — no read on a keystroke (story 32). */
export function matchesStrand(s: StrandSummary, query: string, memberNames: Record<string, string[]>): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (s.title.toLowerCase().includes(q)) return true;
  return (memberNames[s.id] ?? []).some(n => n.toLowerCase().includes(q));
}

/**
 * Re-reads on the strand-set signal and when any listed strand changes (each one
 * watched; a watch follows its strand as it opens, hibernates and wakes). A backstop
 * poll covers what no signal does: every 3 s while start-up is settling, 60 s after.
 * The 10 s poll this replaces read every strand, and each read asked the other member
 * for its latest revision — a third of a phone's idle traffic.
 */
export function strandListStore(model: ChatModel): Loader<StrandList> {
  let latest: StrandList | undefined;
  let notify: (() => void) | null = null;
  const watches = new Map<string, () => void>();

  const syncWatches = () => {
    if (!notify || !latest) return;
    const ids = new Set(latest.strands.map(s => s.id));
    for (const [id, unwatch] of watches) if (!ids.has(id)) { unwatch(); watches.delete(id); }
    for (const id of ids) if (!watches.has(id)) watches.set(id, model.changes.strand(id, notify));
  };

  return loader<StrandList>({
    async load() {
      const [listed, invitations] = await Promise.all([model.strands.list(), model.invitations.listOutstanding()]);
      if (!listed.ok) return listed;
      const strands = listed.value;
      const invitationsOut: Record<string, number> = {};
      for (const inv of invitations.ok ? invitations.value : []) {
        if (inv.direction === 'incoming' || !inv.strandId) continue;
        invitationsOut[inv.strandId] = (invitationsOut[inv.strandId] ?? 0) + 1;
      }
      const memberNames: Record<string, string[]> = {};
      await Promise.all(strands.map(async s => {
        const members = await model.members.list(s.id);
        memberNames[s.id] = members.ok ? members.value.map(m => m.name) : [];
      }));
      // Asked AFTER the read, so the two agree: a strand that finished opening during
      // the read is picked up next time rather than this read declaring the list empty.
      const [settling, bootError] = await Promise.all([model.strands.settling(), model.strands.bootError()]);
      latest = { strands, invitationsOut, memberNames, settling, bootError };
      syncWatches();
      return ok(latest);
    },
    changes(onChange) {
      notify = onChange;
      const unsubscribe = model.changes.strands(onChange);
      syncWatches();
      return () => {
        unsubscribe();
        for (const unwatch of watches.values()) unwatch();
        watches.clear();
        notify = null;
      };
    },
    pollMs: () => (latest && !latest.settling ? 60_000 : 3000),
  });
}
