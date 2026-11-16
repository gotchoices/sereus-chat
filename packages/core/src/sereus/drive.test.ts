/**
 * The strand drive (story 23) through the model, two members on real nodes: folders and files
 * are rows in the strand's database, so the other member sees them; a file's bytes are a blob
 * the other member opens; the rules (a creator-only folder, authors rename and remove, anyone
 * keeps longer) come back as the model's error kinds.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, createHash } from 'node:crypto';
import { createTestParty, until, type TestParty } from '../testing/node-host.js';

type R<T> = { ok: true; value: T } | { ok: false; error: { kind: string; message: string } };
function value<T>(result: R<T>): T {
  if (!result.ok) throw new Error(`${result.error.kind}: ${result.error.message}`);
  return result.value;
}
const kind = <T>(result: R<T>) => (result.ok ? 'ok' : result.error.kind);
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

describe('the strand drive', () => {
  let a: TestParty, b: TestParty, strandId: string;
  const dir = mkdtempSync(join(tmpdir(), 'chat-drive-'));
  const bytes = new Uint8Array(randomBytes(1_500_000));
  const route = join(dir, 'ridge-route.pdf');
  writeFileSync(route, bytes);

  beforeAll(async () => {
    a = await createTestParty('dr-a', { listen: true, fileLayer: true });
    b = await createTestParty('dr-b', { listen: true, fileLayer: true });
    await a.boot(); await b.boot();
    const inv = value(await a.model.invitations.create({ grantsInviteRight: false, visibility: 'private' }));
    strandId = value(await b.model.invitations.accept(inv.token)).strandId;
    await until(async () => {
      const s = await a.model.strands.list();
      return s.ok && s.value.some(x => x.id === strandId && !x.opening);
    }, 'the strand open at A', 120_000);
  }, 180_000);
  afterAll(async () => { await Promise.allSettled([a?.stop(), b?.stop()]); });

  let routes: string, fileId: string;

  it('a folder and a file at A, listed and opened at B', async () => {
    let signalled = 0;
    const stop = b.model.changes.strand(strandId, () => { signalled++; });
    routes = value(await a.model.drive.addFolder(strandId, null, 'Routes', { addPolicy: 'creator' })).id;
    const added = value(await a.model.drive.addFile(strandId, routes, { uri: route, name: 'ridge-route.pdf', mimeType: 'application/pdf', keepFor: 'year' }));
    fileId = added.id;
    expect(added.mine).toBe(true);
    expect(added.here).toBe(true);

    await until(async () => {
      const top = await b.model.drive.list(strandId);
      return top.ok && top.value.folders.some(f => f.id === routes);
    }, 'the folder at B', 60_000);
    // The other member's drive change wakes B's screens, as a message does.
    await until(async () => signalled > 0, 'a strand change at B', 30_000);
    stop();
    let listing = value(await b.model.drive.list(strandId, routes));
    await until(async () => {
      listing = value(await b.model.drive.list(strandId, routes));
      return listing.files.length === 1;
    }, 'the file row at B', 60_000);
    expect(listing.canAdd).toBe(false);
    expect(listing.files[0]).toMatchObject({ name: 'ridge-route.pdf', size: bytes.length, mine: false });

    let uri: string | undefined;
    await until(async () => {
      const opened = await b.model.drive.open(strandId, fileId);
      if (opened.ok) uri = opened.value.uri;
      return !!uri;
    }, 'the file opened at B', 60_000);
    expect(sha(new Uint8Array(readFileSync(uri!)))).toBe(sha(bytes));
  }, 180_000);

  it('the rules, as error kinds', async () => {
    const other = join(dir, 'note.txt');
    writeFileSync(other, 'hello');
    expect(kind(await b.model.drive.addFile(strandId, routes, { uri: other, name: 'note.txt' }))).toBe('not-allowed');
    expect(kind(await b.model.drive.rename(strandId, 'file', fileId, 'mine.pdf'))).toBe('not-allowed');
    expect(kind(await b.model.drive.remove(strandId, 'folder', routes))).toBe('not-allowed');
    expect(kind(await b.model.drive.open(strandId, 'no-such-file'))).toBe('not-found');
    // Anyone may keep a file longer.
    expect(kind(await b.model.drive.keep(strandId, fileId, 'year'))).toBe('ok');
    // B's own file at the top, where anyone adds.
    const note = value(await b.model.drive.addFile(strandId, null, { uri: other, name: 'note.txt', keepFor: 'day' }));
    expect(kind(await a.model.drive.remove(strandId, 'file', note.id))).toBe('not-allowed');
    value(await b.model.drive.remove(strandId, 'file', note.id));
  }, 120_000);

  it('a removed folder is gone for the other member', async () => {
    value(await a.model.drive.remove(strandId, 'file', fileId));
    value(await a.model.drive.remove(strandId, 'folder', routes));
    await until(async () => {
      const top = await b.model.drive.list(strandId);
      return top.ok && !top.value.folders.some(f => f.id === routes);
    }, 'the folder gone at B', 60_000);
  }, 120_000);
});
