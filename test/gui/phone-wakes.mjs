/**
 * Files across a phone's sleep (the strand file layer, packages/core/src/files): the phone joins
 * serchat's conversation, then
 *   1. goes to the background (its strand hibernates); serchat sends a photo; the phone comes
 *      back, and must show the photo;
 *   2. sends a photo and goes to the background at once; serchat may not reach it while it
 *      sleeps; the phone comes back, and serchat must then fetch the photo from it;
 *   3. both away: serchat stops, the phone sends a photo (its message and file wait on the
 *      phone) and goes to the background; then both come back at the same moment, and serchat
 *      must get the message and the photo (the phone's queue and its file outbox).
 * Each step is timed. Needs the app with FILE_LAYER, a relay both can reach (the phone set up
 * with it), Maestro, serchat built.
 *
 *   node test/gui/phone-wakes.mjs [device]   PHOTO=<jpg> PHONE_LOG=<path> SERCHAT_LOG=<path>
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connectBridge } from '../devices/bridge.mjs';
import { collectLogcat } from './logcat.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));
const SERCHAT = join(here, '../../apps/cli/dist/serchat.js');
const DEVICE = process.argv[2] ?? 'RFCR10M17LY';
const RELAY = process.env.RELAY ?? 'relay.sereus.org';
const PORT = Number(process.env.BRIDGE_PORT ?? 9303);
const PHOTO = process.env.PHOTO;
if (!PHOTO) { console.error('PHOTO=<path to a jpg> is required'); process.exit(2); }
const ADB = join(process.env.ANDROID_HOME ?? join(homedir(), 'Library/Android/sdk'), 'platform-tools/adb');
const env = { ...process.env, MAESTRO_CLI_NO_ANALYTICS: '1', PATH: `${process.env.PATH}:${join(homedir(), '.maestro', 'bin')}` };
const t0 = Date.now();
const log = line => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${line}`);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const adb = (...a) => spawnSync(ADB, ['-s', DEVICE, ...a], { encoding: 'utf8' });
const flow = (file, vars = {}) => new Promise((resolve, reject) => {
  const p = spawn('maestro', ['--device', DEVICE, 'test', ...Object.entries(vars).flatMap(([k, v]) => ['-e', `${k}=${v}`]), join(here, 'flows', file)], { env });
  let out = '';
  p.stdout.on('data', c => { out += c; });
  p.on('close', status => (status === 0 ? resolve()
    : reject(new Error(`${file}: ${out.split('\n').filter(l => /FAILED/.test(l)).slice(-2).join(' ')}`))));
});
const toBackground = () => adb('shell', 'input', 'keyevent', 'KEYCODE_HOME');
const toForeground = () => adb('shell', 'monkey', '-p', 'org.sereus.chat', '-c', 'android.intent.category.LAUNCHER', '1');

const home = mkdtempSync(join(tmpdir(), 'serchat-wakes-'));
const serchat = (...args) => [SERCHAT, '--home', home, '-p', 'other', ...args];
const phoneLog = process.env.PHONE_LOG ? collectLogcat(ADB, DEVICE) : null;
let idle, notes = '', code = 1;
try {
  const setUp = spawnSync(process.execPath, serchat('--wait', '30', 'profile', 'set', 'name=Serchat', ';', 'relay', 'add', RELAY), { encoding: 'utf8' });
  if (setUp.status !== 0) throw new Error(`serchat setup failed:\n${setUp.stderr}`);
  const startIdle = async () => {
    const mark = notes.length;
    idle = spawn(process.execPath, serchat('-v', '--bridge', String(PORT), 'idle'), { stdio: ['ignore', 'pipe', 'pipe'] });
    idle.stderr.setEncoding('utf8').on('data', d => { notes += d; });
    idle.stdout.setEncoding('utf8').on('data', d => { notes += d; });
    while (!notes.slice(mark).includes('idle;')) {
      if (idle.exitCode !== null) throw new Error('serchat stopped');
      await sleep(250);
    }
    return connectBridge(`node:${PORT}`);
  };
  let other = await startIdle();
  const { url, strandId } = await other.call('invite');
  for (const deadline = Date.now() + 60_000; !(await other.call('arm', strandId)) && Date.now() < deadline;) await sleep(1000);
  log('the phone joins');
  await flow('rn-join.yaml', { LINK: `chat://invite/${url.slice(url.indexOf('#') + 1)}` });
  log('joined');

  // 1. The phone sleeps; serchat sends; the phone comes back.
  toBackground();
  log('phone in the background; waiting 20 s for its strand to sleep');
  await sleep(20_000);
  const sent = await other.call('send', strandId, 'while-you-were-away', [PHOTO]);
  log(`serchat sent a photo in ${sent.ms} ms; the phone stays away 10 s more`);
  await sleep(10_000);
  const back = Date.now();
  toForeground();
  await flow('rn-see-attachment.yaml');
  log(`1. the phone shows the photo ${((Date.now() - back) / 1000).toFixed(1)} s after it came back`);

  // 2. The phone sends and leaves at once.
  const before = new Set((await other.call('files', strandId)).map(f => f.id));
  await flow('rn-send-photo.yaml');
  toBackground();
  const left = Date.now();
  log("2. the phone sent a photo and went to the background");
  let id = '';
  let fetchedAsleep = false;
  for (const deadline = Date.now() + 30_000; Date.now() < deadline && !fetchedAsleep;) {
    const fresh = (await other.call('files', strandId)).filter(f => !before.has(f.id));
    if (fresh.length) {
      id = fresh[0].id;
      try { await other.call('fetchFile', strandId, id); fetchedAsleep = true; } catch { /* asleep */ }
    }
    if (!fetchedAsleep) await sleep(2000);
  }
  log(fetchedAsleep ? `serchat got it while the phone was away (${((Date.now() - left) / 1000).toFixed(1)} s)`
    : `serchat could not get it while the phone was away${id ? '' : ' (the message had not arrived either)'}; bringing the phone back`);
  if (!fetchedAsleep) {
    const back2 = Date.now();
    toForeground();
    let done = false;
    for (const deadline = Date.now() + 180_000; Date.now() < deadline && !done;) {
      const fresh = (await other.call('files', strandId)).filter(f => !before.has(f.id));
      if (fresh.length) {
        try { await other.call('fetchFile', strandId, fresh[0].id); done = true; } catch { /* not yet */ }
      }
      if (!done) await sleep(2000);
    }
    if (!done) throw new Error("serchat never got the phone's photo");
    log(`serchat got the phone's photo ${((Date.now() - back2) / 1000).toFixed(1)} s after the phone came back`);
  }
  // 3. Both away, then both back at once.
  const known = new Set((await other.call('files', strandId)).map(f => f.id));
  other.close();
  idle.kill('SIGINT');
  await new Promise(r => idle.on('exit', r));
  log('3. serchat is away; the phone sends a photo and goes to the background');
  toForeground();
  await sleep(5000);
  // The picker is occasionally slow to show just after the app comes forward: one retry.
  // A different photo from case 2's, or serchat would hold it already (same content, same CID).
  await flow('rn-send-second-photo.yaml').catch(async (err) => {
    log(`the send flow failed once (${err.message}); again`);
    adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');   // out of a picker left open
    await sleep(3000);
    await flow('rn-send-second-photo.yaml');
  });
  toBackground();
  await sleep(15_000);
  const together = Date.now();
  toForeground();
  other = await startIdle();
  log(`both back (serchat up in ${((Date.now() - together) / 1000).toFixed(1)} s)`);
  await other.call('arm', strandId);
  let got3 = false;
  for (const deadline = Date.now() + 240_000; Date.now() < deadline && !got3;) {
    const fresh = (await other.call('files', strandId)).filter(f => !known.has(f.id));
    if (fresh.length) {
      try { await other.call('fetchFile', strandId, fresh[0].id); got3 = true; } catch { /* not yet */ }
    }
    if (!got3) await sleep(2000);
  }
  if (!got3) throw new Error("3. serchat never got the photo sent while both were away");
  log(`3. serchat got the message and the photo ${((Date.now() - together) / 1000).toFixed(1)} s after both came back`);
  other.close();
  code = 0;
  log('PASS');
} catch (err) {
  log(`FAIL: ${err instanceof Error ? err.message : String(err)}`);
} finally {
  idle?.kill('SIGINT');
  await sleep(3000);
  if (phoneLog) log(`phone log: ${await phoneLog.stop(process.env.PHONE_LOG)} lines`);
  if (process.env.SERCHAT_LOG) writeFileSync(process.env.SERCHAT_LOG, notes.split('\n').filter(l => !/sereus-join|https?:\/\/|chat:\/\/invite/.test(l)).join('\n'));
  rmSync(home, { recursive: true, force: true });
  process.exit(code);
}
