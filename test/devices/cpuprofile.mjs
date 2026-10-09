// cpuprofile.mjs <deviceSubstr> <seconds> <out.cpuprofile> — Hermes sampling CPU profile over
// Metro's inspector (one debugger connection per device: close other tools first).
import { writeFileSync } from 'node:fs';
const [want, secs = '30', out = 'device.cpuprofile'] = process.argv.slice(2);
const list = await (await fetch('http://localhost:8084/json/list')).json();
const t = list.find(x => x.title.includes(want));
if (!t) { console.error(`no target ${want}`); process.exit(2); }
const ws = new WebSocket(t.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
const call = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
await new Promise(r => ws.onopen = r);
await call('Profiler.start');
await new Promise(r => setTimeout(r, Number(secs) * 1000));
const res = await call('Profiler.stop');
if (!res.result?.profile) { console.error('stop failed', JSON.stringify(res).slice(0, 300)); process.exit(1); }
writeFileSync(out, JSON.stringify(res.result.profile));
console.log(`${out}: ${res.result.profile.samples.length} samples`);
process.exit(0);
