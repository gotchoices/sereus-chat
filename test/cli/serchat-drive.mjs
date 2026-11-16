/**
 * The strand drive (story 23) through serchat alone: two profiles share a strand through a
 * relay; A makes a folder only A adds to and adds a file; B lists it, is refused adding there,
 * gets the file (A online to serve it) and checks it is the same bytes; A removes it.
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

  const a = await idle('a', true);
  running.push(a);
  const bridge = await connectBridge(`node:${PORT}`);
  const { url, strandId } = await bridge.call('invite');
  run('b', ['join', url, '--yes']);
  log(`B joined strand ${strandId.slice(0, 8)}`);
  bridge.close();
  log('stopping A');
  await a.stop(); running.pop();
  log('A stopped');

  const file = join(home, 'ridge-route.pdf');
  const bytes = randomBytes(SIZE);
  writeFileSync(file, bytes);
  const sha = b => createHash('sha256').update(b).digest('hex');

  // A write in a two-member strand needs the other member up to agree to it.
  running.push(await idle('b'));
  const made = run('a', ['drive', strandId, 'mkdir', 'Routes', '--creator', ';', 'drive', strandId, 'add', file, '--to', 'Routes', '--keep', 'year']).rows;
  log(`A: folder ${made[0].name} (${made[0].policy}), file ${made[1].name} ${made[1].bytes} bytes in ${made[1].addMs} ms`);

  await running.pop().stop();

  running.push(await idle('a'));
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
  await running.pop().stop();

  running.push(await idle('b'));
  run('a', ['drive', strandId, 'rm', 'Routes/ridge-route.pdf', ';', 'drive', strandId, 'rm', 'Routes']);
  const after = run('a', ['drive', strandId, 'ls']).rows;
  log(`A removed both; the top now holds ${after.length} things`);
  code = same && after.length === 0 ? 0 : 1;
} catch (err) {
  log(`FAIL: ${err.message}`);
} finally {
  await Promise.allSettled(running.map(p => p.stop()));
  rmSync(home, { recursive: true, force: true });
  log(code === 0 ? 'PASS' : 'FAIL');
  process.exit(code);
}
