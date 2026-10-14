/**
 * GUI test: the phone app, driven through its screens by Maestro, joins a strand that serchat
 * (the other person, driven through its bridge) made, and the two exchange messages.
 *
 *   node test/gui/phone-joins-serchat.mjs [device-serial]      default 6a61c968 (the S7)
 *   RELAY=relay.sereus.org  APP_ID=org.sereus.chat  BRIDGE_PORT=9302
 *
 * APP_ID picks the app: org.sereus.chat (React Native) or org.sereus.chat.ns (NativeScript,
 * apps/mobile-ns), each with its own flow and link scheme.
 *
 * Needs: the app installed (a development build with Metro, or a release build; the
 * phone's bridge is not used, only serchat's), a relay both can reach (the phone must
 * already have it; flows/ns-setup.yaml gives it to the NativeScript app), Maestro
 * (mobile.dev) on PATH, serchat built (`yarn workspace serchat build`).
 *
 * Exit 0 when the phone showed serchat's reply after serchat saw the phone's message.
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connectBridge } from '../devices/bridge.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));
const SERCHAT = join(here, '../../apps/cli/dist/serchat.js');
const DEVICE = process.argv[2] ?? '6a61c968';
const RELAY = process.env.RELAY ?? 'relay.sereus.org';
const PORT = Number(process.env.BRIDGE_PORT ?? 9302);
const APP_ID = process.env.APP_ID ?? 'org.sereus.chat';
const APPS = {
  'org.sereus.chat': { flow: 'join-and-talk.yaml', scheme: 'chat' },
  'org.sereus.chat.ns': { flow: 'join-and-talk-ns.yaml', scheme: 'chatns' },
};
const APP = APPS[APP_ID];
if (!APP) { console.error(`APP_ID: one of ${Object.keys(APPS).join(', ')}`); process.exit(2); }
const stamp = Date.now().toString(36);
const PHONE_TEXT = `phone-says-${stamp}`;
const REPLY_TEXT = `serchat-says-${stamp}`;
const t0 = Date.now();
const log = line => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${line}`);
// Maestro reports usage by default; not from our runs. Its own installer puts it in ~/.maestro/bin.
const env = { ...process.env, MAESTRO_CLI_NO_ANALYTICS: '1', PATH: `${process.env.PATH}:${join(homedir(), '.maestro', 'bin')}` };

if (spawnSync('maestro', ['--version'], { stdio: 'ignore', env }).status !== 0) {
  console.error('Maestro (mobile.dev) not found: curl -Ls "https://get.maestro.mobile.dev" | bash');
  process.exit(2);
}

const home = mkdtempSync(join(tmpdir(), 'serchat-gui-'));
const serchat = (...args) => [SERCHAT, '--home', home, '-p', 'other', ...args];
let idle;
let code = 1;
try {
  log(`serchat: a profile with relay ${RELAY}`);
  const setUp = spawnSync(process.execPath, serchat('--wait', '30', 'profile', 'set', 'name=Serchat', ';', 'relay', 'add', RELAY), { encoding: 'utf8' });
  if (setUp.status !== 0) throw new Error(`serchat setup failed:\n${setUp.stderr}`);

  idle = spawn(process.execPath, serchat('--bridge', String(PORT), 'idle'), { stdio: ['ignore', 'ignore', 'pipe'] });
  let notes = '';
  idle.stderr.setEncoding('utf8').on('data', d => { notes += d; });
  while (!notes.includes('idle;')) {
    if (idle.exitCode !== null) throw new Error(`serchat stopped:\n${notes}`);
    await new Promise(r => setTimeout(r, 250));
  }
  const other = await connectBridge(`node:${PORT}`);

  const { url, strandId } = await other.call('invite');
  if (!(await other.call('arm', strandId))) throw new Error('serchat could not watch its own strand');
  const token = url.slice(url.indexOf('#') + 1);
  log(`serchat invited (strand ${strandId.slice(0, 8)}); handing the link to the phone`);

  const maestro = spawn('maestro', ['--device', DEVICE, 'test', join(here, 'flows', APP.flow),
    '-e', `LINK=${APP.scheme}://invite/${token}`, '-e', `PHONE_TEXT=${PHONE_TEXT}`, '-e', `REPLY_TEXT=${REPLY_TEXT}`, '-e', `APP_ID=${APP_ID}`],
    { stdio: ['ignore', 'pipe', 'inherit'], env });
  // Maestro prints each step as it starts and appends COMPLETED when it ends: stamp both,
  // so the join and the sends can be timed and the two apps compared.
  maestro.stdout.setEncoding('utf8').on('data', chunk => {
    for (const piece of chunk.split(/(\n)/)) {
      if (piece === '\n') process.stdout.write('\n');
      else if (piece) process.stdout.write(/^\s*COMPLETED/.test(piece) || /^\s*FAILED/.test(piece) ? `${piece} @${((Date.now() - t0) / 1000).toFixed(1)}s` : piece.trim() ? `[${((Date.now() - t0) / 1000).toFixed(1)}s] ${piece}` : piece);
    }
  });
  const flowDone = new Promise(resolve => maestro.on('exit', c => resolve(c ?? 1)));

  // The other side of the conversation: answer once the phone's message arrives.
  const answered = (async () => {
    for (;;) {
      const seenAt = await other.call('seen', PHONE_TEXT);
      if (seenAt) {
        log(`serchat saw the phone's message; replying`);
        const { ms } = await other.call('send', strandId, REPLY_TEXT);
        log(`serchat's reply committed in ${ms} ms`);
        return true;
      }
      if (maestro.exitCode !== null) return false;
      await new Promise(r => setTimeout(r, 1000));
    }
  })();

  const [flowCode, replied] = await Promise.all([flowDone, answered]);
  other.close();
  code = flowCode === 0 && replied ? 0 : 1;
  log(code === 0 ? 'PASS: the phone joined through its screens, and both messages crossed'
    : `FAIL: maestro exited ${flowCode}, serchat ${replied ? 'replied' : 'never saw the phone\'s message'}`);
} catch (err) {
  log(`FAIL: ${err instanceof Error ? err.message : String(err)}`);
} finally {
  idle?.kill('SIGINT');
  await new Promise(r => setTimeout(r, 3000));
  rmSync(home, { recursive: true, force: true });
  process.exit(code);
}
