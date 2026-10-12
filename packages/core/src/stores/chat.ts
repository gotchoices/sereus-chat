/**
 * One conversation: its messages, members and state, plus the user's writes to it.
 *
 * Writes show at once. A sent message appears as a pending row ("Sending…") until the
 * write returns: then the stored message takes its place, or, if the write failed, the
 * row goes and the caller gets the failure (to put the text back in the composer). An
 * edit shows at once too, until the next read confirms it.
 */
import type { ChatError, ChatModel, Member, Message, Result, SendInput, StrandState } from '../model/index.js';
import { ok } from '../model/index.js';
import { loader, type LoadState, type Loader } from './loader.js';
import { writable, type Readable } from './store.js';

/** Id prefix of a message whose write is in flight. Never a stored id (those are UUIDs). */
export const SENDING_PREFIX = 'sending-';
export const isSending = (message: Pick<Message, 'id'>) => message.id.startsWith(SENDING_PREFIX);

export type ChatView = {
  /** Stored messages, newest last, then the ones still being sent. */
  messages: Message[];
  members: Member[];
  state: StrandState | null;
  /** The user's own outstanding invitations for this strand; read only while nobody else is here. */
  invitationsOut: number;
  /** Known but not open on this device yet (a cold start, a re-attach): not an error. */
  opening: boolean;
};

export interface ChatStore extends Readable<LoadState<ChatView>> {
  reload(): void;
  refresh(): Promise<void>;
  send(input: SendInput & { memberId?: string }): Promise<Result<Message>>;
  edit(messageId: string, content: string): Promise<Result<void>>;
  delete(messageId: string): Promise<Result<void>>;
  react(messageId: string, symbol: string): Promise<Result<void>>;
}

type Stored = Omit<ChatView, 'messages'> & { messages: Message[] };
type Local = { pending: Message[]; sent: Message[]; edits: Record<string, string> };

/**
 * Re-reads on the strand's change signal (which follows the strand as it opens, sleeps
 * and wakes). The backstop poll is every 10 s while the strand is opening and 30 s after;
 * 3 s was tried and reverted: on the S7 a read takes 2.5–4.4 s.
 */
export function chatStore(model: ChatModel, strandId: string): ChatStore {
  let opening = false;
  let previous: Stored | undefined;

  const stored: Loader<Stored> = loader<Stored>({
    async load() {
      const [messages, members] = await Promise.all([model.messages.list(strandId), model.members.list(strandId)]);
      if (!messages.ok || !members.ok) {
        const error = (!messages.ok ? messages.error : (members as { ok: false; error: ChatError }).error);
        if (error.kind === 'not-attached') {
          opening = true;
          return ok({ ...(previous ?? { messages: [], members: [], state: null, invitationsOut: 0 }), opening: true });
        }
        return { ok: false, error };
      }
      opening = false;
      const awaitingJoin = members.value.length > 0 && members.value.every(m => m.isMe);
      const [state, invitations] = await Promise.all([
        model.strands.state(strandId),
        awaitingJoin ? model.invitations.listOutstanding() : Promise.resolve(null),
      ]);
      previous = {
        messages: messages.value,
        members: members.value,
        state: state.ok ? state.value : previous?.state ?? null,
        invitationsOut: invitations?.ok
          ? invitations.value.filter(i => i.strandId === strandId && i.direction !== 'incoming').length
          : 0,
        opening: false,
      };
      return ok(previous);
    },
    changes: onChange => model.changes.strand(strandId, onChange),
    pollMs: () => (opening ? 10_000 : 30_000),
  });

  const local = writable<Local>({ pending: [], sent: [], edits: {} });

  // The view: what was read, with local writes laid over it. Cached on the identity of
  // both inputs, so `get()` returns the same object until either changes.
  let cache: { s: LoadState<Stored>; l: Local; view: LoadState<ChatView> } | null = null;
  const compose = (s: LoadState<Stored>, l: Local): LoadState<ChatView> => {
    if (cache && cache.s === s && cache.l === l) return cache.view;
    let view: LoadState<ChatView>;
    if (s.state !== 'ready') {
      view = s as LoadState<ChatView>;
    } else {
      const ids = new Set(s.value.messages.map(m => m.id));
      const messages = [
        ...s.value.messages.map(m => (l.edits[m.id] !== undefined ? { ...m, content: l.edits[m.id], editedAt: m.editedAt ?? new Date().toISOString() } : m)),
        // Sent but not read back yet: shown as stored, so the row does not flicker.
        ...l.sent.filter(m => !ids.has(m.id)),
        ...l.pending,
      ];
      view = { ...s, value: { ...s.value, messages } };
    }
    cache = { s, l, view };
    return view;
  };

  /** A read that includes a sent message, or follows an edit, retires the local copy. */
  let lastRead: unknown = null;
  const retire = (s: LoadState<Stored>) => {
    if (s.state !== 'ready' || s.value === lastRead) return;
    lastRead = s.value;
    const ids = new Set(s.value.messages.map(m => m.id));
    local.update(l => {
      const sent = l.sent.filter(m => !ids.has(m.id));
      return sent.length === l.sent.length && !Object.keys(l.edits).length ? l : { ...l, sent, edits: {} };
    });
  };

  const view = writable<LoadState<ChatView>>(compose(stored.get(), local.get()), set => {
    const recompute = () => set(compose(stored.get(), local.get()));
    const a = stored.subscribe(s => { retire(s); recompute(); });
    const b = local.subscribe(recompute);
    return () => { a(); b(); };
  });

  return {
    subscribe: view.subscribe,
    get: () => compose(stored.get(), local.get()),
    reload: stored.reload,
    refresh: stored.refresh,

    async send(input) {
      const temp: Message = {
        id: `${SENDING_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2)}`,
        memberId: input.memberId ?? '',
        content: input.content,
        timestamp: new Date().toISOString(),
        replyToId: input.replyToId ?? null,
        editedAt: null,
        attachments: input.attachments ?? [],
        reactions: [],
      };
      local.update(l => ({ ...l, pending: [...l.pending, temp] }));
      const result = await model.messages.send(strandId, input);
      local.update(l => ({
        ...l,
        pending: l.pending.filter(m => m.id !== temp.id),
        sent: result.ok ? [...l.sent, result.value] : l.sent,
      }));
      if (result.ok) void model.messages.saveReadCursor(strandId, result.value.id);
      return result;
    },

    async edit(messageId, content) {
      local.update(l => ({ ...l, edits: { ...l.edits, [messageId]: content } }));
      const result = await model.messages.edit(strandId, messageId, content);
      if (!result.ok) {
        local.update(l => {
          const { [messageId]: _dropped, ...edits } = l.edits;
          return { ...l, edits };
        });
      }
      return result;
    },

    async delete(messageId) {
      const result = await model.messages.delete(strandId, messageId);
      if (result.ok) stored.reload();
      return result;
    },

    async react(messageId, symbol) {
      const result = await model.messages.react(strandId, messageId, symbol);
      if (result.ok) stored.reload();
      return result;
    },
  };
}
