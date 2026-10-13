import type { Attachment } from './media.js';
import type { Result } from './result.js';

export type Reaction = { memberId: string; symbol: string };

export type Message = {
  id: string;
  memberId: string;
  content: string;
  timestamp: string;
  replyToId: string | null;
  editedAt: string | null;
  attachments: Attachment[];
  reactions: Reaction[];
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
  /** The unsent text for a strand. Device-local: a draft never leaves the device. */
  draft(strandId: string): Promise<Result<string>>;
  saveDraft(strandId: string, text: string): Promise<Result<void>>;
  /** The last message read in a strand (drives unread counts), or null. Device-local. */
  readCursor(strandId: string): Promise<Result<string | null>>;
  saveReadCursor(strandId: string, messageId: string): Promise<Result<void>>;
}
