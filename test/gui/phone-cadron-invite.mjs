/**
 * An invitation answered by the person's cadron while their phone sleeps, through the phone's
 * screens (`@chat/cadre-client`'s invitations model):
 *   1. a cadre-cli node (the cadron) starts, with a relay, and the phone claims it by its code;
 *   2. the phone makes an invitation; the screen must say it is ready to hand out, and its
 *      details must name the cadron, not this phone;
 *   3. the QR code opens full screen;
 *   4. the phone goes to the background long enough for its strand to sleep, and serchat (the
 *      other person) joins through the link: the cadron answers.
 *
 *   node test/gui/phone-cadron-invite.mjs [device]      default RFCR10M17LY (the S21)
 *
 * Env: CADRE (the `cadre` binary; default the scratch install's), RELAY_ADDR (a full relay
 * multiaddr for the cadron), AWAY_MS (60000), APK (installed first, data cleared, when given).
 * Never prints the node code or the invitation link.
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const DEVICE = process.argv[2] ?? 'RFCR10M17LY';
const CADRE = process.env.CADRE ?? join(here, '../../node_modules/.bin/cadre');
const RELAY_ADDR = process.env.RELAY_ADDR ?? '/dns4/relay.sereus.org/tcp/4011/ws/p2p/12D3KooWMD7E7UH4rkCqiFE69n7FNqrKo1Xx3yDUU8JvwtaH39bD';
const AWAY_MS = Number(process.env.AWAY_MS ?? 60_000);
const HEALTH = 18311;
const SERCHAT = join(here, '../../apps/cli/dist/serchat.js');
const SDK = process.env.ANDROID_HOME ?? join(homedir(), 'Library/Android/sdk');
const ADB = join(SDK, 'platform-tools/adb');
const env = { ...process.env, ANDROID_HOME: SDK, MAESTRO_CLI_NO_ANALYTICS: '1', PATH: `${process.env.PATH}:${join(homedir(), '.maestro', 'bin')}` };
const t0 = Date.now();
const log = text => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s] ${text}`);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const adb = (...a) => spawnSync(ADB, ['-s', DEVICE, ...a], { encoding: 'utf8' }).stdout ?? '';
const flow = (name, vars = {}) => spawnSync('maestro', ['--device', DEVICE, 'test', join(here, 'flows', name), ...Object.entries(vars).flatMap(([k, v]) => ['-e', `${k}=${v}`])], { env, encoding: 'utf8' });
const ui = () => { adb('shell', 'uiautomator', 'dump', '/sdcard/u.xml'); return adb('shell', 'cat', '/sdcard/u.xml'); };
/** Tap the element with this resource id (an RN testID), by its bounds. */
function tapId(id) {
  const m = ui().match(new RegExp(`resource-id="${id}"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`));
  if (!m) return false;
  adb('shell', 'input', 'tap', String((+m[1] + +m[3]) >> 1), String((+m[2] + +m[4]) >> 1));
  return true;
}
const texts = xml => [...xml.matchAll(/text="([^"]{1,200})"/g)].map(m => m[1]).filter(t => !/sereus-join|https?:\/\/|invite\//.test(t));
const scrubCadreEnv = () => Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('CADRE')));

const dir = mkdtempSync(join(tmpdir(), 'cadron-invite-'));
let node = null;
let code = 1;
try {
  // 1. The cadron, and the phone claims it.
  if (spawnSync(CADRE, ['init', '--dir', join(dir, 'node'), '--port', '4311', '--ws-port', '4312'], { env: scrubCadreEnv() }).status !== 0) throw new Error('cadre init failed');
  node = spawn(CADRE, ['start', '-c', join(dir, 'node', 'cadre.yaml'), '--health-port', String(HEALTH), '--metrics-port', String(HEALTH + 1)], {
    cwd: join(dir, 'node'), env: { ...scrubCadreEnv(), CADRE_RELAY_ADDRS: RELAY_ADDR }, stdio: 'ignore',
  });
  const status = async () => fetch(`http://localhost:${HEALTH}/status`).then(r => r.json()).catch(() => null);
  let s = null;
  for (let i = 0; i < 60 && !(s?.multiaddrs ?? []).some(a => a.includes('p2p-circuit')); i++) { await sleep(2000); s = await status(); }
  if (!s) throw new Error('the cadron did not start');
  log(`cadron ${s.peerId.slice(-8)} up with ${s.multiaddrs.length} addresses (${s.multiaddrs.filter(a => a.includes('p2p-circuit')).length} relayed)`);

  if (process.env.APK) {
    adb('install', '-r', process.env.APK);
    adb('shell', 'pm', 'clear', 'org.sereus.chat');
    const relay = encodeURIComponent(RELAY_ADDR);
    if (flow('rn-setup.yaml', { NAME: 'Bob', RELAY: relay }).status !== 0) throw new Error('setup flow failed');
    log('phone set up fresh');
  }
  const nodeCode = (spawnSync(CADRE, ['code', '-c', join(dir, 'node', 'cadre.yaml'), '--health-port', String(HEALTH)], { encoding: 'utf8', env: scrubCadreEnv() }).stdout.match(/sereus-join:\S+/) ?? [])[0];
  if (!nodeCode) throw new Error('no node code');
  flow('rn-claim-node.yaml', { CODE: nodeCode });
  // Maestro's Next tap does not always register (the flow's header): finish by bounds if needed.
  for (let i = 0; i < 10 && !texts(ui()).some(t => /^add$/i.test(t)); i++) { tapId('cadre-node-code-next'); await sleep(3000); }
  const addBtn = ui().match(/text="ADD"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/i);
  if (addBtn) adb('shell', 'input', 'tap', String((+addBtn[1] + +addBtn[3]) >> 1), String((+addBtn[2] + +addBtn[4]) >> 1));
  // Claimed once the cadron runs in a party of its own owner's, not `unclaimed`.
  let claimed = false;
  for (let i = 0; i < 90 && !claimed; i++) { claimed = !JSON.stringify((await status()) ?? {}).includes('unclaimed'); if (!claimed) await sleep(2000); }
  if (!claimed) throw new Error('the cadron was not claimed');
  log('the phone claimed the cadron');
  await sleep(30_000); // its first record reaches the phone

  // 2. The invitation: ready to hand out, and naming the cadron.
  if (flow('rn-invite-show.yaml').status !== 0) throw new Error('invitation flow failed');
  const url = ui().match(/text="(https:\/\/[^"]*invite[^"]*#[^"]+)"/)?.[1];
  if (!url) throw new Error('no invitation link on screen');
  // The readiness line sits below the link and the QR code: scroll it into view (uiautomator
  // sees only what is on screen).
  adb('shell', 'input', 'swipe', '540', '1800', '540', '700', '300');
  let ready = false;
  const tReady = Date.now();
  for (let i = 0; i < 40 && !ready; i++) { ready = ui().includes('resource-id="invite-readiness-ready"'); if (!ready) await sleep(1500); }
  log(ready ? `the screen says ready to hand out, ${((Date.now() - tReady) / 1000).toFixed(0)} s after the invitation showed` : 'NOT ready on screen within 60 s');
  if (!ready) throw new Error('never ready');
  tapId('invite-details-toggle');
  await sleep(2500);
  const details = texts(ui());
  const start = details.findIndex(t => t.startsWith('Where it tells them'));
  log(`details: ${details.slice(start, start + 8).join(' | ')}`);
  if (!details.slice(start).some(t => t.includes('Machine') || t.includes('…'))) log('(the details name no machine label)');
  if (details.slice(start, start + 6).some(t => t.startsWith('this phone'))) log('NOTE: the invitation names this phone');

  // 3. The QR code full screen.
  adb('shell', 'input', 'swipe', '540', '700', '540', '1600', '300');
  await sleep(800);
  tapId('invite-qr');
  await sleep(1500);
  const full = ui().includes('resource-id="invite-qr-full"');
  log(full ? 'the QR code opened full screen' : 'the QR code did NOT open full screen');
  adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');

  // 4. The phone away; serchat joins.
  adb('shell', 'input', 'keyevent', 'KEYCODE_HOME');
  log(`phone in the background for ${AWAY_MS / 1000} s`);
  await sleep(AWAY_MS);
  const home = join(dir, 'serchat');
  spawnSync(process.execPath, [SERCHAT, '--home', home, '-p', 'nate', '--wait', '30', 'profile', 'set', 'name=Nate', ';', 'relay', 'add', 'relay.sereus.org']);
  const tJoin = Date.now();
  const joined = spawnSync(process.execPath, [SERCHAT, '--home', home, '-p', 'nate', '--wait', '180', 'join', url, '--yes'], { encoding: 'utf8' });
  const tail = joined.stderr.split('\n').filter(l => l && !/sereus-join|https?:\/\/|invite\//.test(l)).slice(-2).join(' / ');
  if (joined.status === 0) { log(`PASS: serchat joined in ${((Date.now() - tJoin) / 1000).toFixed(1)} s with the phone asleep`); code = 0; }
  else log(`FAIL: serchat's join exited ${joined.status}: ${tail}`);
} catch (err) {
  log(`FAIL: ${err instanceof Error ? err.message : String(err)}`);
} finally {
  node?.kill('SIGINT');
  await sleep(2000);
  process.exit(code);
}
