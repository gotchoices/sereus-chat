/**
 * Attachments through the strand file layer (`../files`, gotchoices/sereus#62): the strand
 * carries a `cid:` ref, the bytes go member to member, B gets them identical (fetched in the
 * background as soon as the message lists), and the same file twice is one file.
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

describe('attachments through the strand file layer', () => {
  let a: TestParty, b: TestParty, strandId: string;
  const dir = mkdtempSync(join(tmpdir(), 'chat-filelayer-'));
  const bytes = new Uint8Array(randomBytes(2_300_123));
  const file = join(dir, 'holiday.jpg');
  writeFileSync(file, bytes);

  beforeAll(async () => {
    a = await createTestParty('fl-a', { listen: true, fileLayer: true });
    b = await createTestParty('fl-b', { listen: true, fileLayer: true });
    await a.boot(); await b.boot();
    const inv = value(await a.model.invitations.create({ grantsInviteRight: false, visibility: 'private' }));
    strandId = value(await b.model.invitations.accept(inv.token)).strandId;
    await until(async () => {
      const s = await a.model.strands.list();
      return s.ok && s.value.some(x => x.id === strandId && !x.opening);
    }, 'the strand open at A', 120_000);
  }, 180_000);
  afterAll(async () => { await Promise.allSettled([a?.stop(), b?.stop()]); });

  it('sends a cid: ref, and B has the file identical without asking', async () => {
    const t0 = Date.now();
    const sent = value(await a.model.messages.send(strandId, {
      content: 'the photo',
      attachments: [{ id: 'local', type: 'image', uri: file, name: 'holiday.jpg', mimeType: 'image/jpeg', locality: 'local' }],
    }));
    const sendMs = Date.now() - t0;
    expect(sent.attachments[0].blob).toMatch(/^cid:b[a-z2-7]+$/);
    expect(sent.attachments[0].locality).toBe('local');

    // B lists the message; the background fetch brings the file without B asking for it.
    let att: { id: string; locality: string; uri?: string | null } | undefined;
    await until(async () => {
      const msgs = await b.model.messages.list(strandId);
      att = msgs.ok ? msgs.value.find(x => x.content === 'the photo')?.attachments[0] : undefined;
      return att?.locality === 'local';
    }, "the file at B", 120_000);
    const arrivedMs = Date.now() - t0;
    expect(sha(new Uint8Array(readFileSync(att!.uri!)))).toBe(sha(bytes));
    process.stderr.write(`[file layer] 2.3 MB: send ${sendMs} ms, local at B ${arrivedMs} ms after the send began\n`);
  }, 180_000);

  it('the same file twice is the same file', async () => {
    const one = value(await a.model.messages.send(strandId, {
      content: 'again', attachments: [{ id: 'x', type: 'image', uri: file, name: 'holiday.jpg', locality: 'local' }],
    }));
    const listed = value(await a.model.messages.list(strandId)).find(m => m.content === 'the photo')!;
    expect(one.attachments[0].blob).toBe(listed.attachments[0].blob);
  }, 60_000);
});
