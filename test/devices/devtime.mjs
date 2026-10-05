// devtime.mjs — time messages between two devices through the app's dev bridge
// (src/diagnostics/dev-bridge.ts), over Metro's inspector. No UI involved.
//
//   node devtime.mjs <deviceA-substr> <deviceB-substr> [rounds] [prefix]
//   PAIR=1 node devtime.mjs …     A invites B into a new private strand first, and times the join
//
// For each round: A sends (bridge `send`, the composer's path), host polls B's `seen`
// every 250 ms; then B sends to A. Times are on the host clock.
const [A, B, ROUNDS = '4', PREFIX = 'dt'] = process.argv.slice(2);
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function connect(want) {
  const list = await (await fetch('http://localhost:8084/json/list')).json();
  const t = list.find(x => x.title.includes(want));
  if (!t) throw new Error(`no debug target matching ${want}: ${list.map(x => x.title).join(', ')}`);
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map();
  ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  const evaluate = (expression) => new Promise((res, rej) => {
    const i = ++id; pending.set(i, m => {
      const r = m.result;
      if (m.error) rej(new Error(JSON.stringify(m.error)));
      else if (r?.exceptionDetails) rej(new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text));
      else res(r?.result?.value);
    });
    ws.send(JSON.stringify({ id: i, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }));
  });
  // Hermes ignores awaitPromise: start the call in the app, then poll for its result.
  let seq = 0;
  const call = async (method, ...args) => {
    const key = `c${Date.now()}-${++seq}`;
    await evaluate(`__chatDev.start(${JSON.stringify(key)}, ${JSON.stringify(method)}, ...${JSON.stringify(args)})`);
    for (;;) {
      const r = await evaluate(`__chatDev.take(${JSON.stringify(key)})`);
      if (r) { if (r.ok) return r.value; throw new Error(r.error); }
      await sleep(150);
    }
  };
  return { name: t.title, evaluate, call, close: () => ws.close() };
}

const a = await connect(A), b = await connect(B);
let shared;
if (process.env.PAIR === '1') {
  // A invites into a new private strand; B joins it. Timed, since joining is worth knowing too.
  const t0 = Date.now();
  const inv = await a.call('invite');
  console.log(`A invited in ${Date.now() - t0} ms`);
  const t1 = Date.now();
  const joined = await b.call('accept', inv.url);
  console.log(`B joined in ${Date.now() - t1} ms`);
  shared = { id: joined.strandId ?? inv.strandId, title: '(new)' };
} else {
  const strandsA = await a.call('strands');
  const strandsB = await b.call('strands');
  shared = strandsA.find(s => strandsB.some(t => t.id === s.id));
  if (!shared) { console.log('no strand in common', strandsA, strandsB); process.exit(2); }
}
console.log(`strand ${shared.id.slice(0, 8)} ("${shared.title}" on ${a.name})`);
console.log('armed:', await a.call('arm', shared.id), await b.call('arm', shared.id));

async function one(from, to, text) {
  const t0 = Date.now();
  let commitMs = null, err = null;
  const sending = from.call('send', shared.id, text)
    .then(r => { commitMs = r.ms; }).catch(e => { err = e.message; });
  let seenAt = null;
  while (Date.now() - t0 < 300_000) {
    const v = await to.evaluate(`__chatDev.seen(${JSON.stringify(text)})`).catch(() => null);
    if (v) { seenAt = Date.now() - t0; break; }
    if (err) break;
    await sleep(250);
  }
  await sending;
  console.log(`${text}: sender commit ${commitMs ?? '—'} ms, seen by receiver at ${seenAt ?? 'NEVER'} ms${err ? ` — send failed: ${err}` : ''}`);
  return { commitMs, seenAt };
}

const results = [];
for (let i = 1; i <= Number(ROUNDS); i++) {
  results.push(['A→B', await one(a, b, `${PREFIX}-a${i}`)]);
  results.push(['B→A', await one(b, a, `${PREFIX}-b${i}`)]);
}
for (const dir of ['A→B', 'B→A']) {
  const r = results.filter(([d]) => d === dir).map(([, x]) => x);
  const med = k => { const v = r.map(x => x[k]).filter(x => x != null).sort((p, q) => p - q); return v.length ? v[Math.floor(v.length / 2)] : '—'; };
  console.log(`${dir}: commit median ${med('commitMs')} ms, delivery median ${med('seenAt')} ms (${r.filter(x => x.seenAt == null).length} never)`);
}
a.close(); b.close();
process.exit(0);
