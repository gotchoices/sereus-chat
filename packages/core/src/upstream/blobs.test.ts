/**
 * The stack's blobs (Optimystic 1.29 native blobs under sereus), tested on their own: one node, a
 * one-table schema, nothing of chat. Chat's attachments and drive depend on these behaviours, and
 * the tests are written so they could be handed upstream as they are (gotchoices/sereus#67).
 *
 * A test marked `it.fails` states the behaviour chat needs and the stack does not have yet. It
 * passes while the stack falls short; the day the stack is fixed it fails, which is the signal to
 * drop the mark (and to revisit what chat does in the meantime).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { soloStrand, type SoloStrand } from '../testing/solo-strand.js';

type Blobs = {
  put(source: AsyncIterable<Uint8Array>): Promise<{ ref: string; size: number }>;
  stat(ref: string): Promise<{ locality: string; heldBytes: number }>;
  read(ref: string, options?: { from?: 'anywhere' | 'here' }): AsyncIterable<Uint8Array>;
};
const blobsOf = (s: SoloStrand): Blobs => {
  const blobs = (s.node.getStrands().get(s.strand.strandId)?.libp2pNode as { blobs?: Blobs } | undefined)?.blobs;
  if (!blobs) throw new Error('the strand node has no blob service (Optimystic 1.29 or later)');
  return blobs;
};
async function* stream(bytes: Uint8Array): AsyncIterable<Uint8Array> {
  for (let i = 0; i < bytes.length; i += 64 * 1024) yield bytes.subarray(i, i + 64 * 1024);
}
async function readAll(source: AsyncIterable<Uint8Array>): Promise<number> {
  let n = 0;
  for await (const piece of source) n += piece.length;
  return n;
}

let solo: SoloStrand | null = null;
afterEach(async () => { await solo?.stop(); solo = null; });

describe('the stack\'s blobs', () => {
  it('a strand schema can declare a blobref column, which stores a reference and refuses anything else (sereus#67, gap 1; fixed in 1.24)', async () => {
    solo = await soloStrand('blobref-type', 'table Photo (Id text primary key, Content blobref null)');
    const db = solo.strand.database!.getDatabase();
    const { ref } = await blobsOf(solo).put(stream(new Uint8Array(randomBytes(10_000))));
    await db.exec('insert into App.Photo (Id, Content) values (?, ?)', ['ok', ref]);
    await expect(db.exec('insert into App.Photo (Id, Content) values (?, ?)', ['bad', 'not a reference'])).rejects.toThrow(/BLOBREF/i);
  }, 120_000);

  it('a blob put on a strand node reads back whole', async () => {
    solo = await soloStrand('blob-read', 'table T (Id text primary key)');
    const bytes = new Uint8Array(randomBytes(1_000_000));
    const { ref, size } = await blobsOf(solo).put(stream(bytes));
    expect(size).toBe(bytes.length);
    expect((await blobsOf(solo).stat(ref)).locality).toBe('here');
    expect(await readAll(blobsOf(solo).read(ref, { from: 'here' }))).toBe(bytes.length);
  }, 120_000);

  // Sereus builds strand nodes with no `pieceStorage` and no persistent `kvStore`, so pieces live
  // in memory and a hibernate (on a phone, every trip to the background) rebuilds the node empty.
  // Upstream: gotchoices/sereus#67 (gap 2), backlog `feat-strand-blobs-persist`.
  it.fails('a blob survives its strand hibernating and waking (sereus#67, gap 2: not yet)', async () => {
    solo = await soloStrand('blob-hibernate', 'table T (Id text primary key)');
    const strandId = solo.strand.strandId;
    const { ref } = await blobsOf(solo).put(stream(new Uint8Array(randomBytes(500_000))));
    await solo.node.hibernateStrand(strandId);
    await solo.node.wakeStrand(strandId);
    expect((await blobsOf(solo).stat(ref)).locality).toBe('here');
  }, 120_000);
});
