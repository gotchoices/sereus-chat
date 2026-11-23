/**
 * Files in a strand (attachments, and the drive's files): the bytes live in the strand node's
 * blob service, and a row's `blobref` column names them.
 *
 * The blob service is Optimystic's native blobs, which every strand node has under sereus 1.24:
 * - a file is cut into 256 KiB pieces in IPFS's formats and named by its CIDv1;
 * - it is checked against that name wherever it is received;
 * - it is pulled by whoever reads it.
 * A committed row whose `blobref` column names a blob pins it on the writer, has the strand's
 * cohort pull it, and keeps it alive for as long as a row references it (Optimystic
 * docs/blobs.md).
 *
 * This device also keeps a viewable copy of every file it has, at `FileAccess.cachePath(ref,
 * name)`, so a screen shows it from a plain file.
 *
 * KNOWN GAP (gotchoices/sereus#67, backlog `feat-strand-blobs-persist`). Sereus builds strand
 * nodes with no persistent piece store, so pieces live in memory. A blob no other member has
 * fetched yet is lost when its sender's strand sleeps (on a phone, every trip to the
 * background) or restarts. The stack suite's `test/stack/blob-survives-hibernate.mjs` (expected to
 * fail, `suite.json`) marks the day this changes.
 */
import type { StrandInstance } from '@serfab/cadre-core';
import type { FileAccess } from './host.js';
import { ChatFailure } from './errors.js';

/** The piece size this device reads a file in when putting it (the blob service's own piece size). */
const READ_PIECE = 256 * 1024;

/** The part of the strand node's blob service (Optimystic `BlobService`) files use. */
interface BlobService {
  put(source: AsyncIterable<Uint8Array>): Promise<{ ref: string; size: number }>;
  fetch(ref: string, options?: { waitMs?: number }): Promise<void>;
  read(ref: string, options?: { from?: 'anywhere' | 'here' }): AsyncIterable<Uint8Array>;
  onDurability(listener: (e: { ref: string; durability: { quorum: string } }) => void): () => void;
}

/**
 * How long a fetch keeps looking for a member that holds the file before saying it is still
 * arriving. A node just started may not have found the strand's other members yet.
 */
const FETCH_WAIT_MS = 15_000;

/** How widely a blob must be held before this device stops counting itself its only keeper. */
const SETTLED_QUORUMS = new Set(['majority', 'full']);

export class StrandFiles {
  /** Files put here that no other member is known to hold yet, by reference (`settled`). */
  private readonly unsettled = new Map<string, Promise<void>>();

  constructor(
    private readonly files: FileAccess,
    private readonly perf: (...parts: unknown[]) => void = () => {},
  ) {}

  /** The strand node's blob service; a node without one cannot keep files. */
  private blobsOf(strand: StrandInstance): BlobService {
    const blobs = (strand.libp2pNode as { blobs?: BlobService } | undefined)?.blobs;
    if (!blobs) throw new ChatFailure('not-supported', 'This strand cannot keep files (its node has no blob service).', { retryable: false });
    return blobs;
  }

  /** A local file's size, for limits checked before any bytes move. */
  size(uri: string): Promise<number> {
    return this.files.size(uri);
  }

  /**
   * Put a file from this device into the strand: its bytes into the blob service (pinned until
   * a row referencing them commits), and this device's viewable copy beside every other.
   * Returns the reference to write in a `blobref` column.
   */
  async put(strand: StrandInstance, uri: string, name?: string | null): Promise<{ ref: string; size: number }> {
    const t0 = Date.now();
    const { ref, size } = await this.blobsOf(strand).put(this.files.read(uri, READ_PIECE));
    const copy = this.files.cachePath(ref, name ?? undefined);
    if (!(await this.files.exists(copy).catch(() => false))) {
      if (this.files.copy) await this.files.copy(uri, copy);
      else await this.files.write(copy, this.files.read(uri, READ_PIECE));
    }
    this.perf('file put', size, 'bytes in', Date.now() - t0, 'ms');
    this.track(strand, ref);
    return { ref, size };
  }

  /**
   * Resolves once every file put here is held by a majority of its strand (the blob service's
   * durability), so a short-lived host does not stop while it holds the only copy. Until sereus
   * keeps blobs on disk (sereus#67) that copy would be lost; after, it would wait for the next run.
   * Never rejects; the caller bounds how long it waits.
   */
  async settled(): Promise<void> {
    while (this.unsettled.size) await Promise.allSettled([...this.unsettled.values()]);
  }

  /** Watch a file put here until a majority of its strand holds it. */
  private track(strand: StrandInstance, ref: string): void {
    if (this.unsettled.has(ref)) return;
    const blobs = this.blobsOf(strand);
    const settled = new Promise<void>(resolve => {
      const off = blobs.onDurability(e => {
        if (e.ref !== ref || !SETTLED_QUORUMS.has(e.durability.quorum)) return;
        off();
        this.perf('file settled', ref.slice(-8), e.durability.quorum);
        resolve();
      });
    }).finally(() => this.unsettled.delete(ref));
    this.unsettled.set(ref, settled);
  }

  /** This device's viewable copy of a file, if it has one. */
  async here(ref: string, name?: string | null): Promise<string | null> {
    const path = this.files.cachePath(ref, name ?? undefined);
    return (await this.files.exists(path).catch(() => false)) ? path : null;
  }

  /**
   * The file as a path on this device: its viewable copy, made first if needed by fetching the
   * blob from the members who hold it, waiting up to `waitMs` for one to be reachable. While none
   * is (or none holds it, sereus#67), fails `unavailable` with reason `still-arriving`, retryably.
   */
  async bring(strand: StrandInstance, ref: string, name?: string | null, waitMs = FETCH_WAIT_MS): Promise<string> {
    const existing = await this.here(ref, name);
    if (existing) return existing;
    const path = this.files.cachePath(ref, name ?? undefined);
    const blobs = this.blobsOf(strand);
    const t0 = Date.now();
    try {
      await blobs.fetch(ref, { waitMs });
      const fetched = Date.now();
      await this.files.write(path, blobs.read(ref, { from: 'here' }));
      this.perf('file brought', ref.slice(-8), 'pieces in', fetched - t0, 'ms, copy written in', Date.now() - fetched, 'ms');
    } catch (err) {
      if (err instanceof Error && /BlobUnavailable|BlobTransferStalled/.test(err.name)) {
        this.perf('file', ref.slice(-8), 'not reachable yet:', err.message);
        throw new ChatFailure('unavailable', 'Still arriving: no member who has this file is reachable yet.', { retryable: true, reason: 'still-arriving' });
      }
      throw err;
    }
    return path;
  }
}
