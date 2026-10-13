// bridge.mjs — a client for an app's development bridge (`__chatDev`, @chat/core/diagnostics)
// over an inspector: Metro's for a phone, Node's for serchat (`--bridge <port>`).
//
//   const app = await connectBridge('SM-G935V');      // or 'node:9302'
//   const strands = await app.call('strands');
//   app.close();
//
// Hermes ignores `awaitPromise`, so each call is started in the app and polled for.
import { findTarget } from './target.mjs';

export async function connectBridge(want) {
  const target = await findTarget(want);
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let id = 0;
  const pending = new Map();
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  };
  const evaluate = expression => new Promise((resolve, reject) => {
    const i = ++id;
    pending.set(i, m => {
      const r = m.result;
      if (m.error) reject(new Error(JSON.stringify(m.error)));
      else if (r?.exceptionDetails) reject(new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text));
      else resolve(r?.result?.value);
    });
    ws.send(JSON.stringify({ id: i, method: 'Runtime.evaluate', params: { expression, returnByValue: true } }));
  });
  let calls = 0;
  const call = async (method, ...args) => {
    const key = `call-${Date.now()}-${++calls}`;
    await evaluate(`__chatDev.start(${JSON.stringify(key)}, ${JSON.stringify(method)}, ...${JSON.stringify(args)})`);
    for (;;) {
      const r = await evaluate(`__chatDev.take(${JSON.stringify(key)})`);
      if (r) {
        if (!r.ok) throw new Error(`${method}: ${r.error}`);
        return r.value;
      }
      await new Promise(res => setTimeout(res, 250));
    }
  };
  return { target, call, evaluate, close: () => ws.close() };
}
