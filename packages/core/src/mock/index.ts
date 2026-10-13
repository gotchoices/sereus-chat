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
  Attachment, ChatModel, Invitation, InvitationPreview, Member, Message, Prefs, Profile,
  Result, SearchBatch, StorageUsage, StrandState, StrandSummary,
} from '../model/index.js';
import { fail, ok, pageMessages } from '../model/index.js';

export type FixtureName =
  | 'Strands' | 'Messages' | 'Members' | 'StrandMedia' | 'StrandState'
  | 'Search' | 'Invitations' | 'Prefs' | 'StorageUsage' | 'Profile';
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
  let prefs: Prefs = { ...data<Prefs>('Prefs', 'happy') };
  let profile: Profile = { ...data<Profile>('Profile', 'happy') };

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
      notifyAll();
    },
    reset() {
      sent = {};
      drafts = {};
      readCursors = {};
      prefs = { ...data<Prefs>('Prefs', 'happy') };
      profile = { ...data<Profile>('Profile', 'happy') };
      notifyAll();
    },
  };

  const model: ChatModel = {
    strands: {
      async list() {
        if (isError()) return unavailable((data<{ error?: string }>('Strands', 'error')).error ?? 'Could not reach your strands right now');
        return ok(data<StrandSummary[]>('Strands'));
      },
      // The mock answers from memory: there is never a start-up to wait for, or to fail.
      async settling() { return false; },
      async bootError() { return null; },
      async retryBoot() { return ok(); },
      async settings(strandId) {
        const listed = data<StrandSummary[]>('Strands').find(s => s.id === strandId);
        return ok({ muted: listed?.muted ?? 'none', archived: listed?.archived ?? false });
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
        const all = data<Array<Member & { strands?: string[] }>>('Members', 'happy');
        const mine = all.filter(m => !m.strands || m.strands.includes(strandId));
        return ok((mine.length ? mine : all.filter(m => m.isMe)).map(({ strands: _strands, ...m }) => m));
      },
      async remove() { return ok(); },
      async resignManager() { return ok(); },
    },

    invitations: {
      async create(input) {
        if (isError()) return unavailable('Could not create an invitation');
        if (isUnreachable()) return fail('unreachable', 'There is nowhere for them to answer yet.');
        const token = `tok-${Math.abs(Date.now() % 1e8)}`;
        const singleUse = input.singleUse ?? true;
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
