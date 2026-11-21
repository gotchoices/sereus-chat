/**
 * blobs-eval: Optimystic 1.29's whole path for an attachment. A puts the bytes in its node's blob
 * service and commits a row whose `blobref` column names them. The commit pins and announces the
 * blob, and B, in the strand's cohort, pulls it without anyone reading it: Optimystic's
 * counterpart of our announce-and-prefetch. A hears the blob's durability reach `full`.
 *
 *   BLOB_ENGINE=optimystic npx vitest run src/sereus/blobref.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createTestParty, until, type TestParty } from '../testing/node-host.js';

type Blobs = {
  stat(ref: string): Promise<{ locality: string; heldBytes: number }>;
  onDurability(fn: (e: { ref: string; durability: { quorum: string; confirmed: number; accepting: number } }) => void): () => void;
};
const blobsOf = (p: TestParty, strandId: string) =>
  (p.node.getStrands().get(strandId)?.libp2pNode as unknown as { blobs: Blobs }).blobs;

function value<T>(r: { ok: true; value: T } | { ok: false; error: { kind: string; message: string } }): T {
  if (!r.ok) throw new Error(`${r.error.kind}: ${r.error.message}`);
  return r.value;
}

describe('an attachment through Optimystic blobs and a blobref column', () => {
  let a: TestParty, b: TestParty, strandId: string;
  const dir = mkdtempSync(join(tmpdir(), 'chat-blobref-'));

  beforeAll(async () => {
    a = await createTestParty('br-a', { listen: true, fileLayer: true, blobEngine: 'optimystic' });
    b = await createTestParty('br-b', { listen: true, fileLayer: true, blobEngine: 'optimystic' });
    await a.boot(); await b.boot();
    const inv = value(await a.model.invitations.create({ grantsInviteRight: false, visibility: 'private' }));
    strandId = value(await b.model.invitations.accept(inv.token)).strandId;
    await until(async () => {
      const s = await a.model.strands.list();
      return s.ok && s.value.some(x => x.id === strandId && !x.opening);
    }, 'the strand open at A', 120_000);
  }, 180_000);
  afterAll(async () => { await Promise.allSettled([a?.stop(), b?.stop()]); });

  it('B holds the bytes without reading them, and A hears full durability', async () => {
    const file = join(dir, 'photo.jpg');
    writeFileSync(file, randomBytes(2_300_000));
    const durability: string[] = [];
    const off = blobsOf(a, strandId).onDurability(e => { durability.push(`${e.durability.quorum} ${e.durability.confirmed}/${e.durability.accepting}`); });
    const t0 = Date.now();
    const sent = value(await a.model.messages.send(strandId, {
      content: 'by blobref', attachments: [{ id: 'x', type: 'image', uri: file, name: 'photo.jpg', locality: 'local' }],
    }));
    const sendMs = Date.now() - t0;
    const ref = sent.attachments[0].blob!.replace(/^ob:/, '');
    // Nobody at B lists or opens anything: the cohort pull alone.
    let locality = '';
    await until(async () => {
      locality = (await blobsOf(b, strandId).stat(ref)).locality;
      return locality === 'here';
    }, "the blob at B by the cohort's pull", 120_000);
    const atBMs = Date.now() - t0;
    await until(async () => durability.some(d => d.startsWith('full')), 'full durability at A', 60_000).catch(() => {});
    off();
    process.stderr.write(`[blobref] 2.3 MB: send ${sendMs} ms, held at B ${atBMs} ms after the send began; durability at A: ${durability.join(', ') || 'none'}\n`);
    expect(locality).toBe('here');
  }, 240_000);

  it("a sender whose strand hibernates and wakes before B has the bytes: does it still serve them?", async () => {
    const file = join(dir, 'second.jpg');
    writeFileSync(file, randomBytes(700_000));
    const sent = value(await a.model.messages.send(strandId, {
      content: 'then slept', attachments: [{ id: 'y', type: 'image', uri: file, name: 'second.jpg', locality: 'local' }],
    }));
    const ref = sent.attachments[0].blob!.replace(/^ob:/, '');
    // Before the copy drain's 5 s debounce: A sleeps and wakes, as a phone does in the background.
    await a.node.hibernateStrand(strandId);
    await a.node.wakeStrand(strandId);
    const here = (await blobsOf(a, strandId).stat(ref)).locality;
    process.stderr.write(`[blobref] at A after its strand slept and woke: ${here}\n`);
    let atB = '';
    await until(async () => {
      atB = (await blobsOf(b, strandId).stat(ref)).locality;
      return atB === 'here';
    }, 'the blob at B', 40_000).catch(() => {});
    process.stderr.write(`[blobref] at B 40 s later: ${atB}\n`);
  }, 240_000);
});
