/**
 * The strand drive (story 23) through serchat alone: two profiles share a strand through a
 * relay; A makes a folder only A adds to and adds a file; B lists it, is refused adding there,
 * gets the file (A online to serve it) and checks it is the same bytes; A removes it.
 *
 * A stays up for the whole run and acts through the development bridge, while B uses serchat's
 * own one-shot `drive` commands. That was needed until sereus 1.25, when a file's bytes lived only
 * in memory (gotchoices/sereus#67, gap 2) and a one-shot A took its file with it when it exited.
 * Since 1.25 they are on disk (`serchat-file-survives-restart.mjs`), so A could go back to one-shot
 * commands; left as is, since a running A is what this test was written against.
 *
 *   node test/cli/serchat-drive.mjs
 *
 * Env: RELAY (default relay.sereus.org), BRIDGE_PORT (default 9303), SIZE (bytes, default 3 MB).
 * Needs serchat built (`yarn workspace serchat build`). Invitation links never reach the output.
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connectBridge } from '../devices/bridge.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));
const SERCHAT = join(here, '../../apps/cli/dist/serchat.js');
const RELAY = process.env.RELAY ?? 'relay.sereus.org';
const PORT = Number(process.env.BRIDGE_PORT ?? 9303);
const SIZE = Number(process.env.SIZE ?? 3_000_000);

const home = mkdtempSync(join(tmpdir(), 'serchat-drive-'));
const t0 = Date.now();
const log = text => process.stderr.write(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${text}\n`);
const args = (profile, ...rest) => [SERCHAT, '--home', home, '-p', profile, ...rest];
const scrub = text => text.split('\n').filter(l => !/sereus-join|https?:\/\/|chat:\/\/invite/.test(l)).join('\n');

/** One serchat run; JSON rows back. Fails with its stderr (links dropped) unless `expectFail`. */
function run(profile, words, { expectFail = false } = {}) {
  const r = spawnSync(process.execPath, args(profile, ...(process.env.VERBOSE ? ['-v'] : []), '--json', '--wait', '60', ...words), { encoding: 'utf8' });
  if ((r.status === 0) === expectFail) throw new Error(`serchat ${profile} ${words.slice(0, 3).join(' ')} exited ${r.status}:\n${scrub(r.stderr)}`);
  return { rows: r.stdout.split('\n').filter(Boolean).map(l => JSON.parse(l)), err: scrub(r.stderr) };
}

/** A profile kept running (`idle`), so the other side can reach it. */
async function idle(profile, bridge) {
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

  // A: up for the whole run, driven through the bridge.
  const a = await idle('a', true);
  running.push(a);
  const bridge = await connectBridge(`node:${PORT}`);
  const { url, strandId } = await bridge.call('invite');
  run('b', ['join', url, '--yes']);
  log(`B joined strand ${strandId.slice(0, 8)}`);

  const file = join(home, 'ridge-route.pdf');
  const bytes = randomBytes(SIZE);
  writeFileSync(file, bytes);
  const sha = b => createHash('sha256').update(b).digest('hex');

  // A write in a two-member strand needs the other member up to agree to it.
  const bUp = await idle('b');
  const routes = await bridge.call('drive', strandId, 'addFolder', null, 'Routes', { addPolicy: 'creator' });
  const tAdd = Date.now();
  const added = await bridge.call('drive', strandId, 'addFile', routes.id, { uri: file, name: 'ridge-route.pdf', mimeType: 'application/pdf', keepFor: 'year' });
  log(`A: folder Routes (creator), file ${added.name} ${added.size} bytes in ${Date.now() - tAdd} ms`);
  await bUp.stop();

  // B: serchat's own commands, one run each, with A up to serve the file.
  let listed = [];
  for (let i = 0; i < 10 && !listed.some(r => r.name === 'ridge-route.pdf'); i++) {
    listed = run('b', ['drive', strandId, 'ls', 'Routes']).rows;
  }
  if (!listed.some(r => r.name === 'ridge-route.pdf')) throw new Error('B never listed the file');
  log(`B lists Routes: ${listed.map(r => r.name).join(', ')}`);

  const refused = run('b', ['drive', strandId, 'add', file, '--to', 'Routes'], { expectFail: true });
  log(`B adding to A's folder: refused (${refused.err.trim().split('\n').pop()})`);

  const out = join(home, 'got.pdf');
  const got = run('b', ['drive', strandId, 'get', 'Routes/ridge-route.pdf', '-o', out]).rows[0];
  const same = sha(readFileSync(out)) === sha(bytes);
  log(`B got the file in ${got.fetchMs} ms; ${same ? 'identical' : 'DIFFERENT'}`);

  const bAgain = await idle('b');
  await bridge.call('drive', strandId, 'remove', 'file', added.id);
  await bridge.call('drive', strandId, 'remove', 'folder', routes.id);
  const after = await bridge.call('drive', strandId, 'list', null);
  log(`A removed both; the top now holds ${after.folders.length + after.files.length} things`);
  await bAgain.stop();
  bridge.close();
  code = same && after.folders.length + after.files.length === 0 ? 0 : 1;
} catch (err) {
  log(`FAIL: ${err.message}`);
} finally {
  await Promise.allSettled(running.map(p => p.stop()));
  rmSync(home, { recursive: true, force: true });
  log(code === 0 ? 'PASS' : 'FAIL');
  process.exit(code);
}
