// profsend.mjs — where does one message's time go? Over Metro's inspector, with the
// app's dev bridge (src/diagnostics/dev-bridge.ts):
//   - a Hermes CPU profile of the SENDER while it sends N messages;
//   - the [perf] step timings and loop-lag lines both apps print meanwhile;
//   - when the receiver first sees each message.
//
//   node profsend.mjs <senderSubstr> <receiverSubstr> [count] [out.cpuprofile]
// The two must share a strand (the first one in common is used).
import { writeFileSync } from 'node:fs';
const [S, R, COUNT = '2', OUT = 'send.cpuprofile'] = process.argv.slice(2);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const t00 = Date.now();
const ts = () => `${((Date.now() - t00) / 1000).toFixed(1)}s`;

async function connect(want, tag) {
  const list = await (await fetch('http://localhost:8084/json/list')).json();
  const t = list.find(x => x.title.includes(want));
  if (!t) throw new Error(`no target ${want}`);
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map();
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
    if (m.method === 'Runtime.consoleAPICalled') {
      const txt = m.params.args.map(a => a.value ?? a.description ?? '').join(' ');
      if (/\[perf\]|timing|protocol-client|network-transactor/.test(txt)) console.log(`${ts()} ${tag} ${txt.slice(0, 220)}`);
    }
  };
  const raw = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  const evaluate = async expression => (await raw('Runtime.evaluate', { expression, returnByValue: true })).result?.result?.value;
  let seq = 0;
  const call = async (method, ...args) => {
    const key = `p${Date.now()}-${++seq}`;
    await evaluate(`__chatDev.start(${JSON.stringify(key)}, ${JSON.stringify(method)}, ...${JSON.stringify(args)})`);
    for (;;) {
      const r = await evaluate(`__chatDev.take(${JSON.stringify(key)})`);
      if (r) { if (r.ok) return r.value; throw new Error(r.error); }
      await sleep(150);
    }
  };
  await raw('Runtime.enable');
  return { raw, evaluate, call, close: () => ws.close() };
}

const s = await connect(S, 'SND'), r = await connect(R, 'RCV');
const ss = await s.call('strands'), rs = await r.call('strands');
// Prefer the newest common strand (a fresh pairing lists last).
const common = ss.filter(x => rs.some(y => y.id === x.id));
const strand = common[common.length - 1];
if (!strand) { console.log('no common strand'); process.exit(2); }
console.log(`${ts()} strand ${strand.id.slice(0, 8)}; armed`, await s.call('arm', strand.id), await r.call('arm', strand.id));

await s.raw('Profiler.start');
for (let i = 1; i <= Number(COUNT); i++) {
  const text = `prof-${Date.now()}-${i}`;
  const t0 = Date.now();
  const sending = s.call('send', strand.id, text);
  let seen = null;
  while (Date.now() - t0 < 180_000) {
    if (await r.evaluate(`__chatDev.seen(${JSON.stringify(text)})`)) { seen = Date.now() - t0; break; }
    await sleep(250);
  }
  const { ms } = await sending;
  console.log(`${ts()} MESSAGE ${i}: sender commit ${ms} ms, receiver saw it at ${seen ?? 'NEVER'} ms`);
}
const prof = await s.raw('Profiler.stop');
writeFileSync(OUT, JSON.stringify(prof.result.profile));
console.log(`${ts()} profile → ${OUT} (${prof.result.profile.samples.length} samples)`);
s.close(); r.close();
process.exit(0);
