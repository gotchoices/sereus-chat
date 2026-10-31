import type { Attachment } from './media.js';
import type { Result } from './result.js';

/**
 * Where one of this device's own writes stands, from saved here to held by the others
 * (sereus strands.md, "A commit's durability" and "Offline mode"). Moves forward only,
 * except to `failed`. Other people's records carry none.
 * - `saving`: the write has not returned yet (the store's own pending row).
 * - `waiting`: saved on this device, queued to send (offline mode).
 * - `sending`: being sent to the other members.
 * - `here`: committed, but only this device holds it so far ("not yet delivered").
 * - `delivered`: another machine holds it; it survives this device being lost.
 * - `unconfirmed`: committed, and nothing will report its delivery this session. Not lost.
 * - `failed`: the other members refused it; its rows have left this device's view.
 */
export type Durability = 'saving' | 'waiting' | 'sending' | 'here' | 'delivered' | 'unconfirmed' | 'failed';

export type Delivery = {
  state: Durability;
  /** Waiting, and another member's write could still make it fail (outlook `exposed`). */
  mayFail?: boolean;
  /** Waiting, and no attempt can have delivered it, so it can still be withdrawn. */
  discardable?: boolean;
};

/** What a write did, for naming it when it fails. */
export type WriteKind = 'send' | 'edit' | 'delete' | 'react' | 'unreact' | 'name';

/** One of this device's writes the other members refused: shown until dismissed. */
export type WriteFailure = {
  /** The transaction's id: what `dismissFailure` takes. */
  id: string;
  kind: WriteKind;
  messageId?: string;
  /** A few words of what was written, for "not sent: …". */
  preview?: string;
  /** The queue's reason (`constraint`, `concurrent-modification`, `rejected`, `too-large`, `expired`, …). */
  reason: string;
  at: string;
};

/** This device's marks in one strand: by message id, and by `${messageId} ${symbol}` for reactions. */
export type Deliveries = {
  messages: Record<string, Delivery>;
  reactions: Record<string, Delivery>;
  outbox: Outbox;
};

/** A strand's writes not yet sent, for one quiet line above the conversation. */
export type Outbox = {
  /** Writes saved here and not yet sent. */
  waiting: number;
  /** Waiting because no other member can be reached. */
  waitingForMembers: boolean;
  /** Reads are being answered from this device's own copy. */
  showingSavedCopy: boolean;
  /** Refused writes, until dismissed. */
  failed: WriteFailure[];
};

export type Reaction = { memberId: string; symbol: string; delivery?: Delivery };

export type Message = {
  id: string;
  memberId: string;
  content: string;
  timestamp: string;
  replyToId: string | null;
  editedAt: string | null;
  attachments: Attachment[];
  reactions: Reaction[];
  /** This device's own message: where its latest write (send or edit) stands. */
  delivery?: Delivery;
};

export type SendInput = {
  content: string;
  attachments?: Attachment[];
  replyToId?: string | null;
};

export type ListMessagesOptions = {
  /** Only messages older than this one (by id). */
  before?: string;
  /** At most this many: the newest of what remains. */
  limit?: number;
};

/** Apply `ListMessagesOptions` to a full list, newest last. Both implementations use it. */
export function pageMessages(all: Message[], opts: ListMessagesOptions = {}): Message[] {
  let page = all;
  if (opts.before !== undefined) {
    const at = all.findIndex(m => m.id === opts.before);
    page = at < 0 ? [] : all.slice(0, at);
  }
  if (opts.limit !== undefined && opts.limit >= 0) page = page.slice(Math.max(0, page.length - opts.limit));
  return page;
}

export interface MessagesModel {
  /** Newest last. */
  list(strandId: string, opts?: ListMessagesOptions): Promise<Result<Message[]>>;
  send(strandId: string, input: SendInput): Promise<Result<Message>>;
  /** In place, no history. */
  edit(strandId: string, messageId: string, content: string): Promise<Result<void>>;
  delete(strandId: string, messageId: string): Promise<Result<void>>;
  react(strandId: string, messageId: string, symbol: string): Promise<Result<void>>;
  unreact(strandId: string, messageId: string, symbol: string): Promise<Result<void>>;
  /** Writes saved here and not yet sent, and refused ones, for this strand. */
  outbox(strandId: string): Promise<Result<Outbox>>;
  /**
   * Where this device's writes to a strand stand, without reading its messages: cheap, for
   * laying marks over a list already read. Changes signal on `changes.delivery`.
   */
  deliveries(strandId: string): Promise<Result<Deliveries>>;
  /** Stop showing a refused write. */
  dismissFailure(strandId: string, failureId: string): Promise<Result<void>>;
  /** Withdraw a message still waiting to send (`delivery.discardable`). */
  discard(strandId: string, messageId: string): Promise<Result<void>>;
  /** The unsent text for a strand. Device-local: a draft never leaves the device. */
  draft(strandId: string): Promise<Result<string>>;
  saveDraft(strandId: string, text: string): Promise<Result<void>>;
  /** The last message read in a strand (drives unread counts), or null. Device-local. */
  readCursor(strandId: string): Promise<Result<string | null>>;
  saveReadCursor(strandId: string, messageId: string): Promise<Result<void>>;
}
