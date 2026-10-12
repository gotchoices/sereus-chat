import type { Attachment } from './media.js';
import type { Result } from './result.js';

export type SearchHit = {
  strandId: string;
  strandTitle: string;
  messageId: string;
  senderName: string;
  snippet: string;
  matchRange: [number, number];
  timestamp: string;
};

export type SearchBatch = {
  results: SearchHit[];
  strandsSearched: number;
  strandsTotal: number;
  strandsSkipped: number;
};

export type SearchOptions = {
  strandId?: string;
  kinds?: Array<Attachment['type'] | 'text'>;
  from?: string;
  to?: string;
  senderId?: string;
  signal?: AbortSignal;
};

export interface SearchModel {
  /**
   * A stream, not a promise: there is no cross-strand index and most strands are not
   * running until something wakes them. One batch per strand visited. Aborting the
   * signal must stop the sweep — an abandoned search must not go on waking strands.
   * A failure arrives as an error item and ends the stream.
   */
  run(query: string, opts?: SearchOptions): AsyncIterable<Result<SearchBatch>>;
}
