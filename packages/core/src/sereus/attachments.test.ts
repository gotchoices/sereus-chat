/**
 * Attachment bytes travel with the strand (docs/blobs.md): a file A attaches reaches B as a blob,
 * B's copy is byte-for-byte the same, the same file twice is one blob, and a file over the limit
 * is refused before anything is written.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, createHash } from 'node:crypto';
import { createTestParty, until, type TestParty } from '../testing/node-host.js';

function value<T>(result: { ok: true; value: T } | { ok: false; error: { kind: string; message: string } }): T {
  if (!result.ok) throw new Error(`${result.error.kind}: ${result.error.message}`);
  return result.value;
}
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

describe('attachments carry their bytes', () => {
  let a: TestParty, b: TestParty, strandId: string;
  const dir = mkdtempSync(join(tmpdir(), 'chat-attach-'));
  // Not a multiple of the chunk size, and more than a transaction's worth of chunks.
  const bytes = new Uint8Array(randomBytes(2_300_123));
  const file = join(dir, 'holiday.jpg');
  writeFileSync(file, bytes);

  beforeAll(async () => {
    a = await createTestParty('att-a', { listen: true, maxAttachmentBytes: 3_000_000 });
    b = await createTestParty('att-b', { listen: true });
    await a.boot(); await b.boot();
    const inv = value(await a.model.invitations.create({ grantsInviteRight: false, visibility: 'private' }));
    strandId = value(await b.model.invitations.accept(inv.token)).strandId;
    await until(async () => {
      const s = await a.model.strands.list();
      return s.ok && s.value.some(x => x.id === strandId && !x.opening);
    }, 'the strand open at A', 120_000);
  }, 180_000);
  afterAll(async () => { await Promise.allSettled([a?.stop(), b?.stop()]); });

  it("sends a file whose bytes B can fetch, identical", async () => {
    const t0 = Date.now();
    const sent = value(await a.model.messages.send(strandId, {
      content: 'the photo',
      attachments: [{ id: 'local', type: 'image', uri: file, name: 'holiday.jpg', mimeType: 'image/jpeg', locality: 'local' }],
    }));
    const sendMs = Date.now() - t0;
    const att = sent.attachments[0];
    expect(att.blob).toMatch(/^chunks:1:[0-9a-f]{64}$/);
    expect(att.blob).toBe(`chunks:1:${sha(bytes)}`);
    expect(att.locality).toBe('local');          // the sender keeps its own copy
    expect(att.byteSize).toBe(bytes.length);

    // B: the message arrives, then the file can be fetched.
    let attachmentId = '';
    await until(async () => {
      const msgs = await b.model.messages.list(strandId);
      const m = msgs.ok && msgs.value.find(x => x.content === 'the photo');
      if (m && m.attachments[0]) attachmentId = m.attachments[0].id;
      return !!attachmentId;
    }, 'the message at B', 120_000);
    const t1 = Date.now();
    let uri = '';
    await until(async () => {
      const r = await b.model.media.fetch(strandId, attachmentId);
      if (r.ok) uri = r.value.uri;
      return !!uri;
    }, "the file's bytes at B", 120_000);
    const fetchMs = Date.now() - t1;
    expect(sha(new Uint8Array(readFileSync(uri)))).toBe(sha(bytes));
    const listed = value(await b.model.messages.list(strandId)).find(x => x.content === 'the photo')!;
    expect(listed.attachments[0].locality).toBe('local');
    process.stderr.write(`[attachments] 2.3 MB: send ${sendMs} ms, fetch at B ${fetchMs} ms\n`);
  }, 300_000);

  it('the same file twice is one blob', async () => {
    const again = value(await a.model.messages.send(strandId, {
      content: 'again',
      attachments: [{ id: 'local', type: 'image', uri: file, name: 'holiday.jpg', locality: 'local' }],
    }));
    expect(again.attachments[0].blob).toBe(`chunks:1:${sha(bytes)}`);
    const db = a.node.getStrands().get(strandId)!.database!.getDatabase();
    let blobs = 0;
    for await (const _ of db.eval('select Id from App.Blob')) blobs++;
    expect(blobs).toBe(1);
  }, 120_000);

  it('refuses a file over the limit before writing anything', async () => {
    const big = join(dir, 'big.bin');
    writeFileSync(big, new Uint8Array(3_100_000));
    const before = value(await a.model.messages.list(strandId)).length;
    const r = await a.model.messages.send(strandId, {
      content: 'too big', attachments: [{ id: 'x', type: 'file', uri: big, name: 'big.bin', locality: 'local' }],
    });
    expect(r.ok ? 'ok' : r.error.kind).toBe('too-large');
    expect(value(await a.model.messages.list(strandId)).length).toBe(before);
  }, 60_000);
});
