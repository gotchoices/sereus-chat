/**
 * blob-store.ts — a file's bytes in a strand (docs/blobs.md), until Quereus/Optimystic store large
 * values natively.
 *
 * A blob is split into chunks small enough for a block, each stored once under its sha-256 in
 * `App.BlobChunk`; `App.Blob` lists a blob's chunks in order under the sha-256 of the whole. Both
 * tables are content-keyed, so a repeat of the same bytes (the same file attached twice, or by two
 * members) writes nothing new. Chunks go a few per transaction, under Optimystic's 7.5 MiB limit,
 * and the `Blob` row last: whoever sees it can read every chunk it names, or soon will.
 *
 * THE REF IS THE SWITCH-OVER SEAM. `chunks:1:<sha-256>` names this store and its format; a native
 * store gets its own scheme, and `readBlob` dispatches on the prefix, so blobs written here stay
 * readable after a switch without migrating anything.
 */
import type { StrandInstance } from '@serfab/cadre-core';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

export type BlobRef = string;

/** Raw bytes per chunk: about 342 KiB once base64-encoded, well inside a 1 MiB block target. */
export const CHUNK_SIZE = 256 * 1024;
/** Chunks per transaction: about 2 MiB raw, 2.7 MiB encoded, against the 7.5 MiB limit. */
const CHUNKS_PER_TX = 8;
const SCHEME = 'chunks:1:';

export function isChunkRef(ref: string): boolean {
  return ref.startsWith(SCHEME);
}

function db(strand: StrandInstance) {
  const d = strand.database?.getDatabase();
  if (!d) throw new Error(`Strand ${strand.strandId} has no database open`);
  return d;
}

/** Cut a stream of arbitrary pieces into chunks of exactly `size` bytes (the last may be shorter). */
async function* rechunk(source: AsyncIterable<Uint8Array>, size: number): AsyncIterable<Uint8Array> {
  let buf = new Uint8Array(size);
  let fill = 0;
  for await (const piece of source) {
    let at = 0;
    while (at < piece.length) {
      const n = Math.min(size - fill, piece.length - at);
      buf.set(piece.subarray(at, at + n), fill);
      fill += n; at += n;
      if (fill === size) { yield buf; buf = new Uint8Array(size); fill = 0; }
    }
  }
  if (fill > 0) yield buf.subarray(0, fill);
}

/**
 * Store `source`'s bytes as a blob in `strand`; resolves to its ref and size once every chunk and
 * the `Blob` row are written (in offline mode: saved here, and queued to send).
 */
export async function putBlob(strand: StrandInstance, source: AsyncIterable<Uint8Array>): Promise<{ ref: BlobRef; size: number }> {
  const d = db(strand);
  const whole = sha256.create();
  const hashes: string[] = [];
  let size = 0;
  let batch: Array<[string, Uint8Array]> = [];
  const flush = async () => {
    if (!batch.length) return;
    await d.exec('begin');
    try {
      for (const [hash, bytes] of batch) {
        await d.exec('insert or ignore into App.BlobChunk (Hash, Bytes) values (?, ?)', [hash, bytes]);
      }
      await d.exec('commit');
    } catch (err) {
      await d.exec('rollback').catch(() => {});
      throw err;
    }
    batch = [];
  };
  for await (const chunk of rechunk(source, CHUNK_SIZE)) {
    whole.update(chunk);
    const hash = bytesToHex(sha256(chunk));
    hashes.push(hash);
    size += chunk.length;
    batch.push([hash, chunk]);
    if (batch.length >= CHUNKS_PER_TX) await flush();
  }
  await flush();
  const id = bytesToHex(whole.digest());
  await d.exec('insert or ignore into App.Blob (Id, Size, ChunkSize, Chunks) values (?, ?, ?, ?)',
    [id, size, CHUNK_SIZE, JSON.stringify(hashes)]);
  return { ref: `${SCHEME}${id}`, size };
}

/** A blob's manifest, or null while its `Blob` row has not arrived here. */
export async function blobManifest(strand: StrandInstance, ref: BlobRef): Promise<{ size: number; chunks: string[] } | null> {
  if (!isChunkRef(ref)) throw new Error(`Not a chunk-store blob: ${ref}`);
  for await (const r of db(strand).eval('select Size, Chunks from App.Blob where Id = ?', [ref.slice(SCHEME.length)])) {
    return { size: Number(r.Size), chunks: JSON.parse(r.Chunks as string) as string[] };
  }
  return null;
}

export class BlobNotHereError extends Error {
  constructor(message: string, readonly missing: 'manifest' | 'chunk') { super(message); this.name = 'BlobNotHereError'; }
}

/**
 * A blob's bytes, in order, each chunk checked against its hash and the whole against the ref.
 * Throws `BlobNotHereError` for a part not arrived yet, and plainly for a corrupt one.
 */
export async function* readBlob(strand: StrandInstance, ref: BlobRef): AsyncIterable<Uint8Array> {
  const manifest = await blobManifest(strand, ref);
  if (!manifest) throw new BlobNotHereError(`Blob ${ref} has not arrived yet`, 'manifest');
  const d = db(strand);
  const whole = sha256.create();
  for (const hash of manifest.chunks) {
    let bytes: Uint8Array | undefined;
    for await (const r of d.eval('select Bytes from App.BlobChunk where Hash = ?', [hash])) bytes = r.Bytes as Uint8Array;
    if (!bytes) throw new BlobNotHereError(`A part of blob ${ref} has not arrived yet`, 'chunk');
    if (bytesToHex(sha256(bytes)) !== hash) throw new Error(`A part of blob ${ref} does not match its hash`);
    whole.update(bytes);
    yield bytes;
  }
  if (`${SCHEME}${bytesToHex(whole.digest())}` !== ref) throw new Error(`Blob ${ref} does not match its ref`);
}
