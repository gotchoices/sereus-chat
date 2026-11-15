/**
 * Two phones, one conversation, a photo between them (docs/blobs.md): A invites, B joins and
 * sends a photo from its picker, A opens the conversation and waits for the photo. Phases are
 * timed; each phone's `[conn]` lines say whether its connections went direct (WebRTC) or stayed
 * relayed, and its `[blob]` / `[queue]` lines where the time went.
 *
 *   node test/gui/phones-talk.mjs <A serial> <B serial> [B's display name, default Bob]
 *
 * The invitation link is read off A's screen and handed to B; it is never printed.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const [A, B, PARTNER = 'Bob'] = process.argv.slice(2);
if (!A || !B) { console.error('usage: phones-talk.mjs <A serial> <B serial> [B name]'); process.exit(2); }
const FLOWS = join(dirname(fileURLToPath(import.meta.url)), 'flows');
const ADB = join(process.env.ANDROID_HOME ?? join(homedir(), 'Library/Android/sdk'), 'platform-tools/adb');
const env = { ...process.env, MAESTRO_CLI_NO_ANALYTICS: '1', PATH: `${process.env.PATH}:${join(homedir(), '.maestro', 'bin')}` };
const t0 = Date.now();
const log = line => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${line}`);
const adb = (d, ...a) => spawnSync(ADB, ['-s', d, ...a], { encoding: 'utf8' }).stdout ?? '';
// Async, so the log collector below keeps running while a flow does.
const flow = (d, file, vars = {}) => new Promise((resolve, reject) => {
  const p = spawn('maestro', ['--device', d, 'test', ...Object.entries(vars).flatMap(([k, v]) => ['-e', `${k}=${v}`]), join(FLOWS, file)], { env });
  let out = '';
  p.stdout.on('data', c => { out += c; });
  p.on('close', status => (status === 0 ? resolve()
    : reject(new Error(`${file} on ${d}: ${out.split('\n').filter(l => /FAILED/.test(l)).slice(-2).join(' ')}`))));
});
// Each phone's app log, read from its log buffer every 15 s and kept here, so a buffer that
// wraps (5 MiB on the S21) loses nothing. (A logcat streamed over adb dies when Maestro
// restarts adb; one left running on the phone with `-f` writes nothing on the S21.) Lines
// holding a node code or a link are dropped as they are read.
const logDir = mkdtempSync(join(tmpdir(), 'phones-talk-'));
const streams = {};
const dump = d => new Promise(resolve => {
  const p = spawn(ADB, ['-s', d, 'logcat', '-d', '-v', 'time', '-s', 'ReactNativeJS:V']);
  let raw = '';
  p.stdout.on('data', c => { raw += c; });
  p.on('close', () => resolve(raw));
  p.on('error', () => resolve(''));
});
async function collect(d) {
  const s = streams[d];
  for (const line of (await dump(d)).split('\n')) {
    if (!line.trim() || line.startsWith('---------') || s.seen.has(line)) continue;
    s.seen.add(line);
    if (!/sereus-join|https?:\/\/|chat:\/\/invite/.test(line)) s.lines.push(line);
  }
}
function startLog(d) {
  adb(d, 'logcat', '-G', '16M');
  adb(d, 'logcat', '-c');
  streams[d] = { file: join(logDir, `${d}.log`), seen: new Set(), lines: [] };
}
const collector = setInterval(() => { for (const d of Object.keys(streams)) void collect(d); }, 15_000);
async function stopLog(d) {
  await collect(d);
  // Ordered by the timestamp each line starts with.
  writeFileSync(streams[d].file, [...streams[d].lines].sort().join('\n'));
}
const grepLog = (d, re) => (streams[d] && existsSync(streams[d].file) ? readFileSync(streams[d].file, 'utf8') : '').split('\n').map(l => l.match(re)?.[0]).filter(Boolean);

let code = 1;
try {
  for (const d of [A, B]) startLog(d);
  log('A makes an invitation');
  await flow(A, 'rn-invite-show.yaml');
  adb(A, 'shell', 'uiautomator', 'dump', '/sdcard/u.xml');
  const ui = adb(A, 'shell', 'cat', '/sdcard/u.xml');
  const url = ui.match(/text="(https:\/\/[^"]*invite[^"]*#[^"]+)"/)?.[1];
  if (!url) throw new Error("could not read the invitation link off A's screen");
  const token = url.slice(url.indexOf('#') + 1);
  log('B joins');
  const tJoin = Date.now();
  await flow(B, 'rn-join.yaml', { LINK: `chat://invite/${token}` });
  log(`B is in the conversation after ${((Date.now() - tJoin) / 1000).toFixed(1)} s`);
  log('B sends a photo');
  const tSend = Date.now();
  await flow(B, 'rn-send-photo.yaml');
  log(`B's send returned after ${((Date.now() - tSend) / 1000).toFixed(1)} s; A opens the conversation`);
  await flow(A, 'rn-open-partner.yaml', { PARTNER });
  await flow(A, 'rn-see-attachment.yaml');
  log(`A shows B's photo ${((Date.now() - tSend) / 1000).toFixed(1)} s after B sent it`);
  code = 0;
} catch (err) {
  log(`FAIL: ${err instanceof Error ? err.message : String(err)}`);
} finally {
  clearInterval(collector);
  for (const d of [A, B]) if (streams[d]) await stopLog(d);
  for (const [name, d] of [['A', A], ['B', B]]) {
    const lines = grepLog(d, /\[(conn|blob|queue)\].*/);
    const ice = grepLog(d, /\[ice\].*/);
    const trouble = grepLog(d, /.*(rror|arn|fail|refus|timed out).*/i).map(l => l.replace(/^.*ReactNativeJS\(\s*\d+\): /, '')).slice(-6);
    log(`${name} (${d}):\n    ${lines.slice(-8).join('\n    ') || '(no [conn]/[blob]/[queue] lines)'}${ice.length ? `\n  ICE (last 30):\n    ${ice.slice(-30).join('\n    ')}` : ''}${trouble.length ? `\n  warnings/errors:\n    ${trouble.map(t => t.slice(0, 200)).join('\n    ')}` : ''}`);
  }
  log(`full logs: ${logDir}`);
  log(code === 0 ? 'PASS: the photo crossed between the phones' : 'FAIL');
  process.exit(code);
}
