// inspector-hold.mjs — hold ONE session open to an app's inspector and let any number of
// tool sessions (devtime, devcall) come and go through it.
//
//   node inspector-hold.mjs <upstream ws url> <local port>
//   e.g. adb forward tcp:40001 localabstract:org.sereus.chat.ns-inspectorServer
//        node inspector-hold.mjs ws://127.0.0.1:40001 40011    → tools use ws://127.0.0.1:40011
//
// Why: the NativeScript Android runtime (8.9.2) on the S7 aborts with an uncaught native
// exception shortly after an inspector session closes. Request ids are remapped so tool
// sessions cannot collide; events (console, profiler) go to every tool session.
import { WebSocketServer } from 'ws';

const [upstreamUrl, portArg] = process.argv.slice(2);
// Retry until the app's inspector accepts: connecting first, rather than probing, keeps
// this the only session the app ever sees.
let upstream;
for (;;) {
  upstream = new WebSocket(upstreamUrl);
  const ok = await new Promise(res => { upstream.onopen = () => res(true); upstream.onerror = () => res(false); });
  if (ok) break;
  await new Promise(r => setTimeout(r, 500));
}
upstream.onclose = () => { console.error('upstream closed'); process.exit(1); };

let next = 1;
const routes = new Map(); // upstream id → [client, client's id]
const clients = new Set();
upstream.onmessage = ev => {
  const m = JSON.parse(String(ev.data));
  if (m.id !== undefined && routes.has(m.id)) {
    const [client, id] = routes.get(m.id);
    routes.delete(m.id);
    if (client.readyState === 1) client.send(JSON.stringify({ ...m, id }));
  } else {
    for (const c of clients) if (c.readyState === 1) c.send(String(ev.data));
  }
};

const server = new WebSocketServer({ port: Number(portArg), host: '127.0.0.1' });
server.on('connection', client => {
  clients.add(client);
  client.on('message', data => {
    const m = JSON.parse(String(data));
    const id = next++;
    routes.set(id, [client, m.id]);
    upstream.send(JSON.stringify({ ...m, id }));
  });
  client.on('close', () => clients.delete(client));
});
console.log(`holding ${upstreamUrl}; tools connect to ws://127.0.0.1:${portArg}`);
