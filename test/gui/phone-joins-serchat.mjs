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
import { dirname, join } from 'node:path';
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

  // -v: the stack's log on stderr, so a failed `arm` reports why ("[dev-bridge] arm: …").
  idle = spawn(process.execPath, serchat('-v', '--bridge', String(PORT), 'idle'), { stdio: ['ignore', 'ignore', 'pipe'] });
  let notes = '';
  idle.stderr.setEncoding('utf8').on('data', d => { notes += d; });
  while (!notes.includes('idle;')) {
    if (idle.exitCode !== null) throw new Error(`serchat stopped:\n${notes}`);
    await new Promise(r => setTimeout(r, 250));
  }
  const other = await connectBridge(`node:${PORT}`);

  const { url, strandId } = await other.call('invite');
  // `arm` reads the new strand before watching it. Twice on 1.22 that read failed right after
  // `invite` (2026-11-07), not reproduced since: retry, and report each failure's reason.
  let armed = false;
  for (const deadline = Date.now() + 60_000; !armed && Date.now() < deadline;) {
    armed = await other.call('arm', strandId);
    if (!armed) {
      log(`serchat could not read its new strand yet: ${(notes.match(/\[dev-bridge\] arm: [^\n]*/g) ?? ['(no reason logged)']).pop()}`);
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  if (!armed) throw new Error('serchat could not watch its own strand within 60 s');
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
        // FILE=<path>: the reply carries that file (docs/blobs.md), and the phone must show it.
        const { ms } = await other.call('send', strandId, REPLY_TEXT, ...(process.env.FILE ? [[process.env.FILE]] : []));
        log(`serchat's reply committed in ${ms} ms`);
        return true;
      }
      if (maestro.exitCode !== null) return false;
      await new Promise(r => setTimeout(r, 1000));
    }
  })();

  const [flowCode, replied] = await Promise.all([flowDone, answered]);
  let imageShown = true;
  if (process.env.FILE && flowCode === 0 && replied) {
    // The conversation is on screen: the reply's photo must arrive and show.
    const t = Date.now();
    const shown = spawnSync('maestro', ['--device', DEVICE, 'test', join(dirname(fileURLToPath(import.meta.url)), 'flows', 'rn-see-attachment.yaml')], { env, encoding: 'utf8' });
    imageShown = shown.status === 0;
    log(imageShown ? `the phone shows serchat's photo, ${Date.now() - t} ms after the text` : `FAIL: the photo never showed:\n${shown.stdout.split('\n').filter(l => /FAILED|COMPLETED/.test(l)).slice(-3).join('\n')}`);
  }
  let photoArrived = true;
  if (process.env.PHONE_FILE === '1' && flowCode === 0 && replied) {
    // The phone attaches a photo through the picker and sends it; serchat must fetch it whole
    // (a fetch is checked chunk by chunk and against the ref, so success means intact).
    const before = new Set((await other.call('files', strandId)).map(f => f.id));
    const t = Date.now();
    const sent = spawnSync('maestro', ['--device', DEVICE, 'test', join(dirname(fileURLToPath(import.meta.url)), 'flows', 'rn-send-photo.yaml')], { env, encoding: 'utf8' });
    if (sent.status !== 0) {
      photoArrived = false;
      log(`FAIL: the phone could not send a photo:\n${sent.stdout.split('\n').filter(l => /FAILED|COMPLETED/.test(l)).slice(-3).join('\n')}`);
    } else {
      photoArrived = false;
      for (const deadline = Date.now() + 300_000; !photoArrived && Date.now() < deadline;) {
        const fresh = (await other.call('files', strandId)).filter(f => !before.has(f.id));
        if (fresh.length) {
          try {
            const { ms } = await other.call('fetchFile', strandId, fresh[0].id);
            log(`serchat fetched the phone's photo (${fresh[0].name}, ${fresh[0].byteSize} bytes) ${Date.now() - t} ms after the phone sent it (fetch ${ms} ms)`);
            photoArrived = true;
          } catch (err) { /* still arriving */ }
        }
        if (!photoArrived) await new Promise(r => setTimeout(r, 3000));
      }
      if (!photoArrived) log("FAIL: serchat never got the phone's photo whole within 300 s");
    }
  }
  other.close();
  code = flowCode === 0 && replied && imageShown && photoArrived ? 0 : 1;
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
