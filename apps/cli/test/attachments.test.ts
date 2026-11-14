/**
 * Attachment bytes between two people, real serchat processes through an in-test relay
 * (docs/blobs.md): what Bob attaches reaches Alice byte-for-byte, at three sizes. Timings are
 * printed, since this is the stack's first real large-data traffic.
 *
 *   SCENARIO_ARGS=--offline  … in strand offline mode
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, createHash } from 'node:crypto';
import { Person, scenarioHome, startRelay, stopAllBackground, type Row } from './harness.js';

let relay: Awaited<ReturnType<typeof startRelay>>;
let home: Awaited<ReturnType<typeof scenarioHome>>;
beforeAll(async () => { relay = await startRelay(); home = await scenarioHome(); });
afterEach(stopAllBackground);
afterAll(async () => { await relay?.stop(); await home?.remove(); });

const text = (row: Row) => row.text as string;
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
const note = (line: string) => process.stderr.write(`[attachments scenario] ${line}\n`);

describe('attachments, two people through a relay', () => {
  it("Alice receives Bob's files, identical", async () => {
    const dir = mkdtempSync(join(tmpdir(), 'serchat-files-'));
    const sizes = { 'note.txt': 10_000, 'photo.jpg': 2_000_000, 'video.mp4': 12_000_000 };
    const files = Object.entries(sizes).map(([name, n]) => {
      const bytes = new Uint8Array(randomBytes(n));
      const path = join(dir, name);
      writeFileSync(path, bytes);
      return { name, path, hash: sha(bytes) };
    });

    const alice = new Person('falice', home.dir);
    const bob = new Person('fbob', home.dir);
    await Promise.all([alice.setUp(relay.addr), bob.setUp(relay.addr)]);
    const aliceUp = alice.start('invite', ';', 'tail', '--all');
    const invite = await aliceUp.waitForRow(r => typeof r.url === 'string', 'the invitation');
    await aliceUp.waitForNote('following');
    const [joined] = await bob.ok('join', invite.url as string, '--yes', ';', 'strands', ';', 'send', '1', 'hello');
    const strandId = joined.strandId as string;
    await aliceUp.waitForRow(r => text(r) === 'hello', "bob's hello at alice");

    // Bob sends all three in one message, with Alice up (outside offline mode every write needs her).
    const t0 = Date.now();
    const sent = await bob.ok('send', strandId, 'three files', ...files.flatMap(f => ['--file', f.path]));
    note(`bob sent 3 files (${Object.values(sizes).reduce((a, b) => a + b, 0) / 1e6} MB) in ${Date.now() - t0} ms (commitMs ${String(sent[sent.length - 1]?.commitMs)})`);
    await aliceUp.waitForRow(r => text(r) === 'three files', 'the message at alice', 300_000);
    note(`alice's tail shows the message ${Date.now() - t0} ms after bob started sending`);
    await aliceUp.stop();

    // Alice: both up together (Bob holds the blocks), until her listing shows all three.
    const bobUp = bob.start('idle');
    await bobUp.waitForNote('idle;');
    const t1 = Date.now();
    let listed: Row[] = [];
    for (const deadline = Date.now() + 300_000; Date.now() < deadline;) {
      listed = await alice.ok('attachments', strandId);
      if (listed.length >= 3) break;
      await new Promise(r => setTimeout(r, 2000));
    }
    expect(listed.map(r => r.name).sort()).toEqual(files.map(f => f.name).sort());
    note(`alice lists all three after ${Date.now() - t1} ms`);

    for (const f of files) {
      const out = join(dir, `got-${f.name}`);
      const t = Date.now();
      let row: Row | undefined;
      for (const deadline = Date.now() + 300_000; !row && Date.now() < deadline;) {
        const r = await alice.run('fetch', strandId, listed.find(l => l.name === f.name)!.attachmentId as string, '-o', out);
        if (r.code === 0) row = r.rows[0]; else await new Promise(res => setTimeout(res, 3000));
      }
      expect(row, `${f.name} fetched`).toBeDefined();
      expect(sha(new Uint8Array(readFileSync(out))), `${f.name} identical`).toBe(f.hash);
      note(`alice fetched ${f.name} (${(sizes as Record<string, number>)[f.name] / 1e6} MB) in ${Date.now() - t} ms (fetchMs ${String(row!.fetchMs)})`);
    }
    await bobUp.stop();
  }, 900_000);
});
