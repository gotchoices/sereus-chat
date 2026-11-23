/**
 * Files in a strand (`strand-files.ts`, docs/blobs.md): an attachment's bytes go into the strand
 * node's blob service, its row names them in a `blobref` column, and the other member has the file
 * byte for byte, fetched in the background as soon as the message lists. The same file twice is
 * one blob, and a file over the user's limit is refused before anything is written.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { createTestParty, until, type TestParty } from '../testing/node-host.js';

function value<T>(result: { ok: true; value: T } | { ok: false; error: { kind: string; message: string } }): T {
  if (!result.ok) throw new Error(`${result.error.kind}: ${result.error.message}`);
  return result.value;
}
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
/** A blob reference: a CIDv1 in lowercase base32. */
const CID = /^bafy[a-z2-7]+$/;

type Att = { id: string; locality: string; uri?: string | null };
async function attachmentAt(p: TestParty, strandId: string, content: string): Promise<Att | undefined> {
  const msgs = await p.model.messages.list(strandId);
  return msgs.ok ? msgs.value.find(m => m.content === content)?.attachments[0] : undefined;
}

describe('files in a strand', () => {
  let a: TestParty, b: TestParty, strandId: string, firstRef = '';
  const dir = mkdtempSync(join(tmpdir(), 'chat-files-'));
  const bytes = new Uint8Array(randomBytes(2_300_123));
  const file = join(dir, 'holiday.jpg');
  writeFileSync(file, bytes);

  beforeAll(async () => {
    a = await createTestParty('files-a', { listen: true, maxAttachmentBytes: 3_000_000 });
    b = await createTestParty('files-b', { listen: true });
    await a.boot(); await b.boot();
    const inv = value(await a.model.invitations.create({ grantsInviteRight: false, visibility: 'private' }));
    strandId = value(await b.model.invitations.accept(inv.token)).strandId;
    await until(async () => {
      const s = await a.model.strands.list();
      return s.ok && s.value.some(x => x.id === strandId && !x.opening);
    }, 'the strand open at A', 120_000);
  }, 180_000);
  afterAll(async () => { await Promise.allSettled([a?.stop(), b?.stop()]); });

  it('sends a file by reference, and B has it identical without asking', async () => {
    const t0 = Date.now();
    const sent = value(await a.model.messages.send(strandId, {
      content: 'the photo',
      attachments: [{ id: 'local', type: 'image', uri: file, name: 'holiday.jpg', mimeType: 'image/jpeg', locality: 'local' }],
    }));
    const sendMs = Date.now() - t0;
    const att = sent.attachments[0];
    expect(att.blob).toMatch(CID);
    expect(att.locality).toBe('local');          // the sender keeps its own viewable copy
    expect(att.byteSize).toBe(bytes.length);
    firstRef = att.blob!;

    let atB: Att | undefined;
    await until(async () => (atB = await attachmentAt(b, strandId, 'the photo'))?.locality === 'local', 'the file at B', 120_000);
    expect(sha(new Uint8Array(readFileSync(atB!.uri!)))).toBe(sha(bytes));
    process.stderr.write(`[files] 2.3 MB: send ${sendMs} ms, local at B ${Date.now() - t0} ms after the send began\n`);
  }, 180_000);

  it('a receiver whose strand slept while a file was sent gets it once it wakes', async () => {
    await b.node.hibernateStrand(strandId);
    const second = new Uint8Array(randomBytes(700_000));
    const other = join(dir, 'second.jpg');
    writeFileSync(other, second);
    value(await a.model.messages.send(strandId, {
      content: 'while you slept', attachments: [{ id: 'y', type: 'image', uri: other, name: 'second.jpg', locality: 'local' }],
    }));
    await b.node.wakeStrand(strandId);
    let atB: Att | undefined;
    await until(async () => (atB = await attachmentAt(b, strandId, 'while you slept'))?.locality === 'local', 'the file at B after it woke', 120_000);
    expect(sha(new Uint8Array(readFileSync(atB!.uri!)))).toBe(sha(second));
  }, 300_000);

  it('the same file twice is one blob', async () => {
    const again = value(await a.model.messages.send(strandId, {
      content: 'again', attachments: [{ id: 'z', type: 'image', uri: file, name: 'holiday.jpg', locality: 'local' }],
    }));
    expect(again.attachments[0].blob).toBe(firstRef);
  }, 60_000);

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
