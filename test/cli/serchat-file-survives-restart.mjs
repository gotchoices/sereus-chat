/**
 * A file outlives its sender's process (gotchoices/sereus#67, gap 2; fixed in sereus 1.25):
 *   1. A invites B; B joins while A is up.
 *   2. With B down, A sends a photo in a one-shot run and exits: no one else has fetched it, so
 *      the only copy is in A's stores on disk.
 *   3. A starts again as a new process; B comes up and fetches the photo.
 * Passes when B's copy matches the original byte for byte. Before 1.25 the pieces lived in
 * memory, so step 3 found none and B's fetch reported the file still arriving.
 *
 *   node test/cli/serchat-file-survives-restart.mjs
 *
 * Env: RELAY (default relay.sereus.org), SIZE (bytes, default 600000), BRIDGE_PORT (9307), VERBOSE.
 * A profile in use by a running process takes no one-shot command, so A's invitation goes through
 * the development bridge (`--bridge`, test/devices/bridge.mjs).
 * Needs `apps/cli/dist` built. Never prints the invitation link.
 */
import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connectBridge } from '../devices/bridge.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));
const SERCHAT = join(here, '../../apps/cli/dist/serchat.js');
const RELAY = process.env.RELAY ?? 'relay.sereus.org';
const SIZE = Number(process.env.SIZE ?? 600_000);
const PORT = Number(process.env.BRIDGE_PORT ?? 9307);

const home = mkdtempSync(join(tmpdir(), 'serchat-restart-'));
const t0 = Date.now();
const log = text => process.stderr.write(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${text}\n`);
const args = (profile, ...rest) => [SERCHAT, '--home', home, '-p', profile, ...rest];
const scrub = text => text.split('\n').filter(l => !/sereus-join|https?:\/\/|chat:\/\/invite/.test(l)).join('\n');
const sha = buf => createHash('sha256').update(buf).digest('hex');

/** One serchat run; JSON rows back. Fails with its stderr (links dropped) unless `expectFail`. */
function run(profile, words, { expectFail = false, wait = 60 } = {}) {
  const r = spawnSync(process.execPath, args(profile, ...(process.env.VERBOSE ? ['-v'] : []), '--json', '--wait', String(wait), ...words), { encoding: 'utf8' });
  if ((r.status === 0) === expectFail) throw new Error(`serchat ${profile} ${words[0]} exited ${r.status}:\n${scrub(r.stderr)}`);
  return { rows: r.stdout.split('\n').filter(Boolean).map(l => JSON.parse(l)), err: scrub(r.stderr) };
}

/** A profile kept running (`idle`), so the other side can reach it. */
async function idle(profile, bridge = false) {
  const p = spawn(process.execPath, args(profile, ...(bridge ? ['--bridge', String(PORT)] : []), 'idle'), { stdio: ['ignore', 'pipe', 'pipe'] });
  let notes = '';
  p.stderr.setEncoding('utf8').on('data', d => { notes += d; });
  while (!notes.includes('idle;')) {
    if (p.exitCode !== null) throw new Error(`serchat ${profile} stopped:\n${scrub(notes)}`);
    await new Promise(r => setTimeout(r, 250));
  }
  return { stop: () => new Promise(r => { p.once('exit', r); p.kill('SIGINT'); }) };
}

let code = 1;
const running = [];
try {
  for (const [p, name] of [['a', 'Priya'], ['b', 'Bob']]) run(p, ['profile', 'set', `name=${name}`, ';', 'relay', 'add', RELAY]);
  log(`two profiles with relay ${RELAY}`);

  // 1. A invites; B joins while A is up.
  let a = await idle('a', true);
  running.push(a);
  const bridge = await connectBridge(`node:${PORT}`);
  const { url, strandId: strand } = await bridge.call('invite');
  bridge.close();
  run('b', ['join', url, '--yes'], { wait: 180 });
  log(`B joined strand ${strand.slice(0, 8)}`);
  await a.stop(); running.splice(running.indexOf(a), 1);

  // 2. B down; A sends a photo in a one-shot run and exits.
  const photo = join(home, 'photo.jpg');
  const original = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), randomBytes(SIZE - 4)]);
  writeFileSync(photo, original);
  run('a', ['send', strand, 'the ridge at dawn', '--file', photo]);
  log(`A sent a ${SIZE}-byte photo and exited; B never saw it`);

  // 3. A again, as a new process; B fetches.
  a = await idle('a');
  running.push(a);
  log('A is up again (a new process)');
  const out = join(home, 'fetched.jpg');
  let fetched = false;
  for (let i = 1; i <= 6 && !fetched; i++) {
    const listed = run('b', ['attachments', strand]).rows;
    const row = listed.find(r => r.id || r.row);
    if (!row) { log(`attempt ${i}: B lists no attachment yet`); await new Promise(r => setTimeout(r, 10_000)); continue; }
    const r = spawnSync(process.execPath, args('b', '--json', '--wait', '60', 'fetch', strand, String(row.row ?? row.id), '-o', out), { encoding: 'utf8' });
    if (r.status === 0) fetched = true;
    else { log(`attempt ${i}: fetch exited ${r.status}: ${scrub(r.stderr).trim().split('\n').pop()}`); await new Promise(res => setTimeout(res, 10_000)); }
  }
  if (!fetched) throw new Error('B could not fetch the photo from the restarted A');
  const same = sha(readFileSync(out)) === sha(original);
  log(same ? 'PASS: B fetched the photo from A after A restarted, byte for byte' : 'FAIL: B fetched a file that differs from the original');
  code = same ? 0 : 1;
} catch (err) {
  log(`FAIL: ${err instanceof Error ? err.message : String(err)}`);
  code = 1;
} finally {
  await Promise.allSettled(running.map(p => p.stop()));
  process.exit(code);
}
