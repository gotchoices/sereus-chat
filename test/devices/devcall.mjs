// devcall.mjs <deviceSubstr> <method> [jsonArg...] — call one dev-bridge method
// (src/diagnostics/dev-bridge.ts) on a device over Metro's inspector and print its result as JSON.
//
//   node devcall.mjs SM-G935V traffic 60
//   node devcall.mjs sdk_gphone strands
//   node devcall.mjs node:9301 strands      serchat started with --bridge 9301
//
// One debugger connection per device: close other tools on that device first.
import { findTarget } from './target.mjs';
const [WANT, METHOD, ...RAW] = process.argv.slice(2);
const args = RAW.map(a => { try { return JSON.parse(a); } catch { return a; } });
const sleep = ms => new Promise(r => setTimeout(r, ms));

const t = await findTarget(WANT).catch(err => { console.error(err.message); process.exit(2); });
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pending = new Map();
ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const evaluate = expression => new Promise((res, rej) => {
  const i = ++id; pending.set(i, m => {
    const r = m.result;
    if (m.error) rej(new Error(JSON.stringify(m.error)));
    else if (r?.exceptionDetails) rej(new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text));
    else res(r?.result?.value);
  });
  ws.send(JSON.stringify({ id: i, method: 'Runtime.evaluate', params: { expression, returnByValue: true } }));
});
// Hermes ignores awaitPromise: start the call in the app, then poll for its result.
const key = `call-${Date.now()}`;
await evaluate(`__chatDev.start(${JSON.stringify(key)}, ${JSON.stringify(METHOD)}, ...${JSON.stringify(args)})`);
for (;;) {
  const r = await evaluate(`__chatDev.take(${JSON.stringify(key)})`);
  if (r) {
    if (!r.ok) { console.error(r.error); process.exit(1); }
    console.log(JSON.stringify(r.value, null, 2));
    break;
  }
  await sleep(250);
}
ws.close();
process.exit(0);
