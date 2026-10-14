// target.mjs — find the inspector target for a device name.
//
//   <substring>   a phone, among Metro's targets (localhost:8084), by its title
//   node:<port>   serchat started with --bridge <port> (Node's own inspector)
//   ws://…        an inspector's WebSocket outright (NativeScript: `ns debug android --start`)
export async function findTarget(want) {
  if (/^wss?:\/\//.test(want)) return { title: want, webSocketDebuggerUrl: want };
  const node = /^node:(\d+)$/.exec(want);
  const url = node ? `http://127.0.0.1:${node[1]}/json/list` : 'http://localhost:8084/json/list';
  const list = await (await fetch(url)).json();
  const t = node ? list[0] : list.find(x => x.title.includes(want));
  if (!t) throw new Error(`no debug target matching ${want}: ${list.map(x => x.title).join(', ')}`);
  return t;
}
