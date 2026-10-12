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

export interface MessagesModel {
  /** Newest last. */
  list(strandId: string, opts?: { before?: string; limit?: number }): Promise<Result<Message[]>>;
  send(strandId: string, input: SendInput): Promise<Result<Message>>;
  /** In place, no history. */
  edit(strandId: string, messageId: string, content: string): Promise<Result<void>>;
  delete(strandId: string, messageId: string): Promise<Result<void>>;
  react(strandId: string, messageId: string, symbol: string): Promise<Result<void>>;
  unreact(strandId: string, messageId: string, symbol: string): Promise<Result<void>>;
}
