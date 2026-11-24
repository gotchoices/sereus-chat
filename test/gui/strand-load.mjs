/**
 * How busy a phone's JavaScript thread gets as it holds more strands. One serchat stays up as
 * the other member of every strand; the phone joins one more strand at a time through its
 * screens, then sits on the strand list while its `[loop]` lines (a perf build:
 * `PERF_LOG = true`) report how late timers fire and how many strands are up.
 *
 *   node test/gui/strand-load.mjs [device] [count]     default 6a61c968 (the S7), 10 strands
 *
 * Env: RELAY (default relay.sereus.org), BRIDGE_PORT (9304), HOLD_MS (90000: the quiet window
 * after each join), OUT (a file for the table), SERCHAT_LOG (the peer's own log).
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connectBridge } from '../devices/bridge.mjs';
import { collectLogcat } from './logcat.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const SERCHAT = join(here, '../../apps/cli/dist/serchat.js');
const DEVICE = process.argv[2] ?? '6a61c968';
const COUNT = Number(process.argv[3] ?? 10);
const RELAY = process.env.RELAY ?? 'relay.sereus.org';
const PORT = Number(process.env.BRIDGE_PORT ?? 9304);
const HOLD_MS = Number(process.env.HOLD_MS ?? 90_000);
const ADB = join(process.env.ANDROID_HOME ?? join(homedir(), 'Library/Android/sdk'), 'platform-tools/adb');
const env = { ...process.env, MAESTRO_CLI_NO_ANALYTICS: '1', PATH: `${process.env.PATH}:${join(homedir(), '.maestro', 'bin')}` };
const t0 = Date.now();
const log = line => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s] ${line}`);

const home = mkdtempSync(join(tmpdir(), 'serchat-load-'));
const serchat = (...args) => [SERCHAT, '--home', home, '-p', 'peer', ...args];
const phoneLog = collectLogcat(ADB, DEVICE);
let idle;
let notes = '';
const rows = [];

/** The `[loop]` lines logged since `since` (phone clock = this machine's, near enough). */
function loopLines(lines, since) {
  return lines.filter(l => l.includes('[loop]')).filter(l => {
    const m = l.match(/^(\d\d)-(\d\d) (\d\d):(\d\d):(\d\d)/);
    if (!m) return false;
    const d = new Date(); d.setMonth(Number(m[1]) - 1, Number(m[2])); d.setHours(Number(m[3]), Number(m[4]), Number(m[5]), 0);
    return d.getTime() >= since;
  });
}

try {
  const setUp = spawnSync(process.execPath, serchat('--wait', '30', 'profile', 'set', 'name=Peer', ';', 'relay', 'add', RELAY), { encoding: 'utf8' });
  if (setUp.status !== 0) throw new Error(`serchat setup failed:\n${setUp.stderr}`);
  idle = spawn(process.execPath, serchat('-v', '--bridge', String(PORT), 'idle'), { stdio: ['ignore', 'pipe', 'pipe'] });
  idle.stdout.setEncoding('utf8').on('data', d => { notes += d; });
  idle.stderr.setEncoding('utf8').on('data', d => { notes += d; });
  while (!notes.includes('idle;')) {
    if (idle.exitCode !== null) throw new Error('serchat stopped');
    await new Promise(r => setTimeout(r, 250));
  }
  const peer = await connectBridge(`node:${PORT}`);

  const measure = async (label) => {
    const since = Date.now();
    await new Promise(r => setTimeout(r, HOLD_MS));
    await phoneLog.flush();
    const lines = loopLines(phoneLog.lines(), since);
    const blocked = lines.map(l => Number(l.match(/\((\d+)%\)/)?.[1] ?? NaN)).filter(n => !Number.isNaN(n));
    const worst = lines.map(l => Number(l.match(/worst (\d+) ms/)?.[1] ?? NaN)).filter(n => !Number.isNaN(n));
    const up = lines.map(l => l.match(/\[loop\] (\d+\/\d+) strands/)?.[1]).filter(Boolean).pop() ?? '?';
    const avg = blocked.length ? Math.round(blocked.reduce((s, n) => s + n, 0) / blocked.length) : NaN;
    rows.push(`${label}\t${up}\t${avg}%\t${worst.length ? Math.max(...worst) : '?'} ms`);
    log(`${label}: ${up} strands up, JS thread blocked ${avg}% on average, worst tick ${worst.length ? Math.max(...worst) : '?'} ms late (${blocked.length} reports)`);
  };

  // The phone as it is, on its strand list.
  spawnSync('maestro', ['--device', DEVICE, 'test', join(here, 'flows', 'rn-home.yaml')], { env, encoding: 'utf8' });
  await measure('before');

  for (let i = 1; i <= COUNT; i++) {
    const { url } = await peer.call('invite');
    const link = `chat://invite/${url.slice(url.indexOf('#') + 1)}`;
    let joined = false;
    for (let attempt = 1; attempt <= 2 && !joined; attempt++) {
      await phoneLog.flush();
      const r = spawnSync('maestro', ['--device', DEVICE, 'test', join(here, 'flows', 'rn-join.yaml'), '-e', `LINK=${link}`], { env, encoding: 'utf8' });
      joined = r.status === 0;
      if (!joined) log(`join ${i} attempt ${attempt} failed`);
    }
    if (!joined) { log(`join ${i} failed twice; stopping`); break; }
    spawnSync('maestro', ['--device', DEVICE, 'test', join(here, 'flows', 'rn-home.yaml')], { env, encoding: 'utf8' });
    await measure(`after join ${i}`);
  }
  peer.close();
  if (process.env.OUT) writeFileSync(process.env.OUT, `when\tup\tblocked\tworst\n${rows.join('\n')}\n`);
  console.log(`\nwhen\tup\tblocked\tworst\n${rows.join('\n')}`);
} catch (err) {
  log(`FAIL: ${err instanceof Error ? err.message : String(err)}`);
} finally {
  idle?.kill('SIGINT');
  await new Promise(r => setTimeout(r, 3000));
  // SERCHAT_LOG: the peer's own log (its stderr and stdout), node codes and links dropped.
  if (process.env.SERCHAT_LOG) writeFileSync(process.env.SERCHAT_LOG, notes.split('\n').filter(l => !/sereus-join|https?:\/\/|chat:\/\/invite/.test(l)).join('\n'));
  const saved = join(tmpdir(), `strand-load-${DEVICE}.log`);
  await phoneLog.stop(saved);
  // Every [loop] report, whenever it was read: the per-window table above misses reports that
  // Maestro cleared from the buffer before they were read.
  console.log(`\nevery report (${saved}):`);
  for (const l of phoneLog.lines().filter(l => l.includes('[loop]'))) {
    const m = l.match(/^\S+ (\S+).*\[loop\] (\d+\/\d+) strands up: worst (\d+) ms late.*\((\d+)%\)/);
    if (m) console.log(`${m[1]}  ${m[2]} up  blocked ${m[4]}%  worst ${m[3]} ms`);
  }
  rmSync(home, { recursive: true, force: true });
}
