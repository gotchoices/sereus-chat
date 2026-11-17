/**
 * The mock `ChatModel`: domain-shaped fixtures and in-memory writes, for design review,
 * screenshots and tests. No node, no network.
 *
 * Fixtures are injected (`FixtureSource`): React Native bundles JSON only through static
 * `require`s, so the app supplies them; tests read the same files (repo root
 * `mock/data/<Name>/<variant>.json`) from disk.
 *
 * Variants, chosen with `MockControls.setVariant` (the app applies them from deep links):
 *   happy        the fixtures' happy data
 *   empty        empty lists, a fresh profile
 *   error        reads and writes fail with `unavailable`
 *   unreachable  creating an invitation fails with `unreachable` (story 02 Alt A): its
 *                own variant because it is neither an error nor an empty state
 */
import { buildInviteUrl } from '../protocol/index.js';
import type {
  AddPolicy, Attachment, ChatModel, DriveFile, DriveFolder, Invitation, KeepFor, InvitationPreview, Member, Message, Prefs, Profile,
  Result, SearchBatch, StorageUsage, StrandState, StrandSummary,
} from '../model/index.js';
import { fail, ok, pageMessages } from '../model/index.js';

export type FixtureName =
  | 'Strands' | 'Messages' | 'Members' | 'StrandMedia' | 'StrandState'
  | 'Search' | 'Invitations' | 'Prefs' | 'StorageUsage' | 'Profile' | 'Drive';
export type FixtureVariant = 'happy' | 'empty' | 'error';

/** One fixture file's parsed contents, or undefined when there is none. */
export type FixtureSource = (name: FixtureName, variant: FixtureVariant) => unknown;

export type MockVariant = 'happy' | 'empty' | 'error' | 'unreachable' | (string & {});

export interface MockControls {
  getVariant(): MockVariant;
  /** Switch the fixtures under every screen; signals `changes.strands` and every strand. */
  setVariant(variant: MockVariant): void;
  /** Forget in-memory writes (sent messages, prefs, profile). */
  reset(): void;
}

type DriveFixture = {
  folders: Array<Omit<DriveFolder, 'mine' | 'canAdd'>>;
  files: Array<Omit<DriveFile, 'mine'>>;
};

const ME = 'p-bob';
const KEEP_MS: Record<KeepFor, number> = { day: 86_400_000, week: 7 * 86_400_000, month: 30 * 86_400_000, year: 365 * 86_400_000 };

const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

export function createMockModel(fixtures: FixtureSource): { model: ChatModel; controls: MockControls } {
  let variant: MockVariant = 'happy';
  const isEmpty = () => variant === 'empty';
  const isError = () => variant === 'error';
  const isUnreachable = () => variant === 'unreachable';

  function data<T>(name: FixtureName, which: FixtureVariant = isEmpty() ? 'empty' : 'happy'): T {
    const found = fixtures(name, which) ?? fixtures(name, 'happy');
    if (found === undefined) throw new Error(`mock fixture ${name}/${which} is missing`);
    return found as T;
  }

  const unavailable = <T>(message: string): Result<T> => fail<T>('unavailable', message);

  let sent: Record<string, Message[]> = {};
  let drafts: Record<string, string> = {};
  let readCursors: Record<string, string> = {};
  /** The user's private names: `strandId\nmemberId` → name. */
  const nicknames = new Map<string, string>();
  /** The user's private strand notes: strandId → text. */
  const notes = new Map<string, string>();
  let prefs: Prefs = { ...data<Prefs>('Prefs', 'happy') };
  let profile: Profile = { ...data<Profile>('Profile', 'happy') };

  /** Each strand's drive, seeded from the `Drive` fixture on first use; writes stay in memory. */
  let drives = new Map<string, DriveFixture>();
  const driveOf = (strandId: string): DriveFixture => {
    let d = drives.get(strandId);
    if (!d) {
      const src = data<DriveFixture>('Drive');
      drives.set(strandId, (d = { folders: src.folders.map(f => ({ ...f })), files: src.files.map(f => ({ ...f })) }));
    }
    return d;
  };
  const folderView = (f: DriveFixture['folders'][number]): DriveFolder =>
    ({ ...f, mine: f.createdBy === ME, canAdd: f.addPolicy === 'anyone' || f.createdBy === ME });
  const live = (f: DriveFixture['files'][number]) => Date.parse(f.expiresAt) > Date.now();
  const fileView = (f: DriveFixture['files'][number]): DriveFile => ({ ...f, mine: f.addedBy === ME });
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
  const notAllowed = <T>(message: string): Result<T> => fail<T>('not-allowed', message);
  const notFound = <T>(message: string): Result<T> => fail<T>('not-found', message);
  const driveId = (prefix: string) => `${prefix}-local-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const driveWrite = <T>(strandId: string, value: T): Result<T> => { notifyStrand(strandId); return ok(value); };

  const strandsListeners = new Set<() => void>();
  const strandListeners = new Map<string, Set<() => void>>();
  const notifyStrand = (strandId: string) => strandListeners.get(strandId)?.forEach(fn => fn());
  const notifyAll = () => {
    strandsListeners.forEach(fn => fn());
    strandListeners.forEach(set => set.forEach(fn => fn()));
  };

  const controls: MockControls = {
    getVariant: () => variant,
    setVariant(next) {
      variant = next;
      drives = new Map();
      notifyAll();
    },
    reset() {
      sent = {};
      drafts = {};
      readCursors = {};
      nicknames.clear();
      notes.clear();
      drives = new Map();
      prefs = { ...data<Prefs>('Prefs', 'happy') };
      profile = { ...data<Profile>('Profile', 'happy') };
      notifyAll();
    },
  };

  const model: ChatModel = {
    strands: {
      async list() {
        if (isError()) return unavailable((data<{ error?: string }>('Strands', 'error')).error ?? 'Could not reach your strands right now');
        return ok(data<StrandSummary[]>('Strands').map(s => ({ ...s, note: notes.get(s.id) ?? s.note ?? null })));
      },
      // The mock answers from memory: there is never a start-up to wait for, or to fail.
      async settling() { return false; },
      async bootError() { return null; },
      async retryBoot() { return ok(); },
      async awaken() { return ok({ woken: [], asleep: [] }); },
      rotate() {},
      async settings(strandId) {
        const listed = data<StrandSummary[]>('Strands').find(s => s.id === strandId);
        return ok({ muted: listed?.muted ?? 'none', archived: listed?.archived ?? false });
      },
      async note(strandId) { return ok(notes.get(strandId) ?? null); },
      async setNote(strandId, text) {
        if (text?.trim()) notes.set(strandId, text.trim()); else notes.delete(strandId);
        notifyAll();
        return ok();
      },
      async setMuted() { return ok(); },
      async setArchived() { return ok(); },
      async state() {
        if (isError()) return unavailable('Could not read this strand’s state');
        return ok(data<StrandState>('StrandState'));
      },
      async leave() { return ok(); },
    },

    messages: {
      async list(strandId, opts) {
        if (isError()) return unavailable('Could not reach this conversation right now');
        return ok(pageMessages([...data<Message[]>('Messages'), ...(sent[strandId] ?? [])], opts));
      },
      async send(strandId, input) {
        if (isError()) return unavailable('Could not write that message');
        const message: Message = {
          id: `m-local-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          memberId: 'p-bob',
          content: input.content,
          timestamp: new Date().toISOString(),
          replyToId: input.replyToId ?? null,
          editedAt: null,
          attachments: input.attachments ?? [],
          reactions: [],
        };
        (sent[strandId] ||= []).push(message);
        notifyStrand(strandId);
        return ok(message);
      },
      async edit() { return ok(); },
      async delete() { return ok(); },
      async react() { return ok(); },
      async unreact() { return ok(); },
      // The mock has no network: everything it writes is at once where it will stay.
      async outbox() { return ok({ waiting: 0, waitingForMembers: false, showingSavedCopy: false, failed: [] }); },
      async deliveries() {
        return ok({ messages: {}, reactions: {}, outbox: { waiting: 0, waitingForMembers: false, showingSavedCopy: false, failed: [] } });
      },
      async dismissFailure() { return ok(); },
      async discard() { return fail('not-supported', 'Nothing is waiting to send.'); },
      async draft(strandId) { return ok(drafts[strandId] ?? ''); },
      async saveDraft(strandId, text) { drafts[strandId] = text; return ok(); },
      async readCursor(strandId) { return ok(readCursors[strandId] ?? null); },
      async saveReadCursor(strandId, messageId) { readCursors[strandId] = messageId; return ok(); },
    },

    members: {
      async list(strandId) {
        if (isError()) return unavailable('Could not load members');
        if (isEmpty()) return ok(data<Member[]>('Members', 'empty'));
        // Membership is per strand, so a two-party strand really is two people.
        const all = data<Array<Omit<Member, 'ownName'> & { ownName?: string; strands?: string[] }>>('Members', 'happy');
        const mine = all.filter(m => !m.strands || m.strands.includes(strandId));
        return ok((mine.length ? mine : all.filter(m => m.isMe)).map(({ strands: _strands, ...m }) => {
          const nickname = nicknames.get(`${strandId}\n${m.id}`) ?? null;
          const ownName = m.ownName ?? m.name;
          return { ...m, ownName, nickname, name: nickname ?? ownName };
        }));
      },
      async remove() { return ok(); },
      async resignManager() { return ok(); },
      async setNickname(strandId, memberId, name, opts) {
        const k = `${strandId}\n${memberId}`;
        const previous = nicknames.get(k);
        const next = name?.trim() || null;
        if (opts?.everywhere && previous !== undefined) {
          for (const [key, v] of [...nicknames]) if (v === previous) { if (next) nicknames.set(key, next); else nicknames.delete(key); }
        } else if (next) nicknames.set(k, next); else nicknames.delete(k);
        notifyAll();
        return ok();
      },
      async nicknames() { return ok([...new Set(nicknames.values())].sort()); },
      async nicknameUses(name) { return ok([...nicknames.values()].filter(v => v === name).length); },
    },

    invitations: {
      prepare() { /* nothing to prepare: the mock founds instantly */ },
      async create(input) {
        if (isError()) return unavailable('Could not create an invitation');
        if (isUnreachable()) return fail('unreachable', 'There is nowhere for them to answer yet.');
        const token = `tok-${Math.abs(Date.now() % 1e8)}`;
        const singleUse = input.singleUse ?? true;
        if (input.note?.trim() && input.strandId) notes.set(input.strandId, input.note.trim());
        const invitation: Invitation = {
          id: `i-${token}`,
          token,
          url: buildInviteUrl(token),
          qrPayload: buildInviteUrl(token),
          strandId: input.strandId ?? null,
          expiresAt: new Date(Date.now() + (input.validForMs ?? 7 * 864e5)).toISOString(),
          grantsInviteRight: input.grantsInviteRight,
          singleUse,
          spent: false,
          direction: 'outgoing',
        };
        return ok(invitation);
      },
      async listOutstanding() {
        if (isError()) return unavailable('Could not load invitations');
        return ok(data<Invitation[]>('Invitations'));
      },
      async cancel() { return ok(); },
      async inspect() {
        if (isError()) {
          const spent: InvitationPreview = {
            inviterName: 'Unknown', inviterAvatarUri: null,
            strandState: data<StrandState>('StrandState', 'happy'),
            grantsInviteRight: false, status: 'spent',
          };
          return ok(spent);
        }
        return ok({
          inviterName: 'Bob', inviterAvatarUri: null,
          strandState: data<StrandState>('StrandState'),
          grantsInviteRight: false, status: 'live',
        });
      },
      async accept() {
        if (isError()) return fail('invitation-unusable', 'That invitation could not be used');
        return ok({ strandId: 's-susan' });
      },
    },

    media: {
      async list(_strandId, opts) {
        if (isError()) return unavailable('Could not list what was shared here');
        const all = data<Attachment[]>('StrandMedia');
        return ok(opts?.kind ? all.filter(a => a.type === opts.kind) : all);
      },
      async storageUsage() {
        if (isError()) return unavailable('Could not measure storage');
        return ok(data<StorageUsage>('StorageUsage', 'happy'));
      },
      async trim() { return ok({ bytesFreed: 402_000_000 }); },
      async fetch(_strandId, attachmentId) {
        const a = data<Attachment[]>('StrandMedia').find(x => x.id === attachmentId);
        return a?.uri ? ok({ uri: a.uri }) : fail('unavailable', 'Still arriving: not every part of this file is here yet.', { retryable: true, reason: 'still-arriving' });
      },
    },

    drive: {
      async list(strandId, folderId = null) {
        if (isError()) return unavailable(data<{ error?: string }>('Drive', 'error').error ?? 'Could not read the drive');
        const d = driveOf(strandId);
        const folder = folderId ? d.folders.find(f => f.id === folderId) : null;
        if (folderId && !folder) return notFound('That folder is no longer in the drive.');
        const path: DriveFolder[] = [];
        for (let up = folder?.parentId; up; up = d.folders.find(f => f.id === up)?.parentId) {
          const p = d.folders.find(f => f.id === up);
          if (!p) break;
          path.unshift(folderView(p));
        }
        const here = folder ? folderView(folder) : null;
        return ok({
          folder: here,
          path,
          canAdd: here?.canAdd ?? true,
          folders: d.folders.filter(f => f.parentId === (folderId ?? null)).sort(byName).map(folderView),
          files: d.files.filter(f => f.folderId === (folderId ?? null) && live(f)).sort(byName).map(fileView),
        });
      },
      async addFolder(strandId, parentId, name, opts) {
        if (isError()) return unavailable('Could not add that folder');
        const d = driveOf(strandId);
        const parent = parentId ? d.folders.find(f => f.id === parentId) : null;
        if (parent && !folderView(parent).canAdd) return notAllowed('Only the member who made this folder adds to it.');
        const folder = { id: driveId('df'), parentId, name: name.trim(), createdBy: ME, createdByName: profile.name || 'Me', createdAt: new Date().toISOString(), addPolicy: opts?.addPolicy ?? 'anyone' as AddPolicy };
        d.folders.push(folder);
        return driveWrite(strandId, folderView(folder));
      },
      async addFile(strandId, folderId, input) {
        if (isError()) return unavailable('Could not add that file');
        const d = driveOf(strandId);
        const folder = folderId ? d.folders.find(f => f.id === folderId) : null;
        if (folder && !folderView(folder).canAdd) return notAllowed('Only the member who made this folder adds to it.');
        const now = Date.now();
        const file = {
          id: driveId('dfile'), folderId, name: input.name, size: 250_000, mimeType: input.mimeType ?? null,
          addedBy: ME, addedByName: profile.name || 'Me', addedAt: new Date(now).toISOString(),
          expiresAt: new Date(now + KEEP_MS[input.keepFor ?? 'month']).toISOString(),
          fingerprint: Math.random().toString(36).slice(2, 8), here: true, uri: input.uri,
        };
        d.files.push(file);
        return driveWrite(strandId, fileView(file));
      },
      async open(strandId, fileId) {
        if (isError()) return unavailable('Could not open that file');
        const f = driveOf(strandId).files.find(x => x.id === fileId);
        if (!f) return notFound('That file is no longer in the drive.');
        return f.uri ? ok({ uri: f.uri }) : fail('unavailable', 'Still arriving: not every part of this file is here yet.', { retryable: true, reason: 'still-arriving' });
      },
      async rename(strandId, kind, id, name) {
        const d = driveOf(strandId);
        const row = kind === 'folder' ? d.folders.find(f => f.id === id) : d.files.find(f => f.id === id);
        if (!row) return notFound('That is no longer in the drive.');
        if (('createdBy' in row ? row.createdBy : row.addedBy) !== ME) return notAllowed('Only the member who added it can rename it.');
        row.name = name.trim();
        return driveWrite(strandId, undefined);
      },
      async move(strandId, kind, id, to) {
        const d = driveOf(strandId);
        const row = kind === 'folder' ? d.folders.find(f => f.id === id) : d.files.find(f => f.id === id);
        if (!row) return notFound('That is no longer in the drive.');
        if (('createdBy' in row ? row.createdBy : row.addedBy) !== ME) return notAllowed('Only the member who added it can move it.');
        if (kind === 'folder') {
          for (let at: string | null = to; at; at = d.folders.find(f => f.id === at)?.parentId ?? null) {
            if (at === id) return fail('invalid-input', 'A folder cannot go inside itself.');
          }
          (row as DriveFixture['folders'][number]).parentId = to;
        } else (row as DriveFixture['files'][number]).folderId = to;
        return driveWrite(strandId, undefined);
      },
      async keep(strandId, fileId, keepFor) {
        const f = driveOf(strandId).files.find(x => x.id === fileId);
        if (!f) return notFound('That file is no longer in the drive.');
        const until = Date.now() + KEEP_MS[keepFor];
        if (until > Date.parse(f.expiresAt)) f.expiresAt = new Date(until).toISOString();
        return driveWrite(strandId, fileView(f));
      },
      async remove(strandId, kind, id) {
        const d = driveOf(strandId);
        if (kind === 'file') {
          const f = d.files.find(x => x.id === id);
          if (!f) return notFound('That file is no longer in the drive.');
          if (f.addedBy !== ME && live(f)) return notAllowed('Only the member who added it can remove it.');
          d.files = d.files.filter(x => x.id !== id);
          return driveWrite(strandId, undefined);
        }
        const folder = d.folders.find(x => x.id === id);
        if (!folder) return notFound('That folder is no longer in the drive.');
        if (folder.createdBy !== ME) return notAllowed('Only the member who made it can remove it.');
        const inside = new Set([id]);
        for (let grew = true; grew;) {
          grew = false;
          for (const f of d.folders) if (f.parentId && inside.has(f.parentId) && !inside.has(f.id)) { inside.add(f.id); grew = true; }
        }
        const others = d.folders.some(f => inside.has(f.id) && f.createdBy !== ME)
          || d.files.some(f => f.folderId && inside.has(f.folderId) && f.addedBy !== ME && live(f));
        if (others) return notAllowed('Someone else’s files or folders are still in it.');
        d.folders = d.folders.filter(f => !inside.has(f.id));
        d.files = d.files.filter(f => !(f.folderId && inside.has(f.folderId)));
        return driveWrite(strandId, undefined);
      },
      async setAddPolicy(strandId, folderId, policy) {
        const f = driveOf(strandId).folders.find(x => x.id === folderId);
        if (!f) return notFound('That folder is no longer in the drive.');
        if (f.createdBy !== ME) return notAllowed('Only the member who made this folder chooses who adds to it.');
        f.addPolicy = policy;
        return driveWrite(strandId, undefined);
      },
    },

    search: {
      /** Streams in batches, one per "strand visited", so a progressive UI has something to render. */
      async *run(_query, opts) {
        if (isError()) {
          yield unavailable<SearchBatch>('Search could not run');
          return;
        }
        const src = data<SearchBatch>('Search');
        const total = opts?.strandId ? 1 : src.strandsTotal;
        const skipped = opts?.strandId ? 0 : src.strandsSkipped;
        const hits = opts?.strandId ? src.results.filter(r => r.strandId === opts.strandId) : src.results;
        for (let i = 1; i <= total; i++) {
          if (opts?.signal?.aborted) return;
          await wait(120);
          yield ok({
            results: hits.filter((_, idx) => idx % total === (i - 1) % total),
            strandsSearched: i,
            strandsTotal: total,
            strandsSkipped: i === total ? skipped : 0,
          });
        }
      },
    },

    profile: {
      async get() { return ok(profile); },
      async save(next) {
        if (isError()) return unavailable('Could not save your profile');
        profile = { ...next };
        return ok();
      },
    },

    prefs: {
      async get() { return ok(prefs); },
      async set(patch) {
        prefs = { ...prefs, ...patch };
        return ok(prefs);
      },
    },

    reachability: {
      async get() { return { reachable: !isUnreachable(), relayPending: false, relays: prefs.relayAddrs, relayStatus: null }; },
    },

    cadre: {
      async status() {
        return ok({
          running: true, partyId: 'mock-party', peerId: '12D3KooWMockThisDevice', ownerEnrolled: true, ownerFingerprint: 'MockOwnr',
          machines: [
            { peerId: '12D3KooWMockThisDevice', thisDevice: true, addresses: [] },
            ...(isEmpty() ? [] : [{ peerId: '12D3KooWMockHomeServer', thisDevice: false, addresses: ['/dns4/home.example/tcp/4002/ws'] }]),
          ],
        });
      },
      async inspectNodeCode(text) {
        if (!text.trim().startsWith('sereus-join:')) return fail('invalid-node-code', 'This is not a node code.', { reason: 'not-node-code' });
        return ok({ peerId: '12D3KooWMockNewNode', addresses: ['/ip4/192.168.1.20/tcp/4002/ws'], reach: 'home-network' as const });
      },
      async claimNode(text) {
        if (!text.trim().startsWith('sereus-join:')) return fail('invalid-node-code', 'This is not a node code.', { reason: 'not-node-code' });
        if (isUnreachable()) return fail('node-unreachable', 'Could not reach that machine.', { reason: 'home-network' });
        return ok();
      },
      async removeMachine() { return ok(); },
      async exportOwnerKey() { return ok('mock-owner-key-not-a-secret'); },
    },

    changes: {
      cadre(onChange) {
        strandsListeners.add(onChange);
        return () => { strandsListeners.delete(onChange); };
      },
      strands(onChange) {
        strandsListeners.add(onChange);
        return () => { strandsListeners.delete(onChange); };
      },
      reachability(onChange) {
        strandsListeners.add(onChange);
        return () => { strandsListeners.delete(onChange); };
      },
      // Nothing the mock writes ever changes where it stands.
      delivery() { return () => {}; },
      strand(strandId, onChange) {
        let set = strandListeners.get(strandId);
        if (!set) strandListeners.set(strandId, (set = new Set()));
        set.add(onChange);
        return () => { set.delete(onChange); };
      },
    },
  };

  return { model, controls };
}
