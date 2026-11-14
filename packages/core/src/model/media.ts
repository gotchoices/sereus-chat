import type { Result } from './result.js';

export type Locality = 'local' | 'fetching' | 'unreachable';

export type Attachment = {
  id: string;
  messageId?: string;
  type: 'image' | 'video' | 'file' | 'voice';
  /** null does NOT mean absent — check `locality`. */
  uri: string | null;
  mimeType?: string;
  name?: string;
  byteSize?: number | null;
  durationMs?: number | null;
  locality: Locality;
  /** The content's ref (docs/blobs.md), when its bytes travel with the strand. */
  blob?: string | null;
};

export type StorageUsage = {
  totalBytes: number;
  byStrand: Array<{ strandId: string; title: string; bytes: number }>;
};

export interface MediaModel {
  list(strandId: string, opts?: { kind?: Attachment['type'] }): Promise<Result<Attachment[]>>;
  /**
   * Bring an attachment's bytes to this device: assembled from the strand into a local copy, whose
   * `uri` this returns. Fails `unavailable` (reason `still-arriving`) while parts have not arrived.
   */
  fetch(strandId: string, attachmentId: string): Promise<Result<{ uri: string }>>;
  storageUsage(): Promise<Result<StorageUsage>>;
  trim(strandId: string, criteria: { olderThan?: string; kind?: Attachment['type'] }): Promise<Result<{ bytesFreed: number }>>;
}
