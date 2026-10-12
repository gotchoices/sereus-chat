// devlog.mjs <seconds> <out-prefix> <deviceSubstr>... — capture every console line from each
// device's app over Metro's inspector, with the host time each line arrived, one file per device:
// <out-prefix>-<n>.log. Lines buffered before attach (since boot) arrive first, marked REPLAY.
//
// Pair it with a debug configuration in apps/mobile/src/debug-bootstrap.js. Metro allows one
// debugger connection per device: close other tools (devtime, profsend) first.
import { createWriteStream } from 'node:fs';
const [SECS = '180', OUT = 'devlog', ...WANT] = process.argv.slice(2);
const list = await (await fetch('http://localhost:8084/json/list')).json();
const t0 = Date.now();
await Promise.all(WANT.map((want, n) => new Promise((resolve, reject) => {
	const t = list.find(x => x.title.includes(want));
	if (!t) { reject(new Error(`no target ${want}`)); return; }
	const out = createWriteStream(`${OUT}-${n}.log`);
	out.write(`# ${t.title}\n`);
	const ws = new WebSocket(t.webSocketDebuggerUrl);
	let live = false;
	ws.onopen = () => {
		ws.send(JSON.stringify({ id: 1, method: 'Runtime.enable' }));
		// Everything before this arrives as a burst; mark it so analysis can skip it.
		setTimeout(() => { live = true; }, 1500);
	};
	ws.onmessage = ev => {
		const m = JSON.parse(ev.data);
		if (m.method !== 'Runtime.consoleAPICalled') return;
		const text = m.params.args.map(a => a.value ?? a.description ?? '').join(' ').replace(/\n/g, ' ⏎ ');
		out.write(`${((Date.now() - t0) / 1000).toFixed(3)} ${live ? 'LIVE' : 'REPLAY'} ${m.params.type} ${text}\n`);
	};
	setTimeout(() => { ws.close(); out.end(resolve); }, Number(SECS) * 1000);
})));
console.log(`captured ${SECS}s from ${WANT.join(', ')} → ${OUT}-*.log`);
process.exit(0);
