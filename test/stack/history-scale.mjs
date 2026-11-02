/**
 * How the chat's message list costs as a conversation's history grows, in Node, on bare
 * cadre-core with the chat sApp schema: one founder alone (no network in the read path),
 * blocks in memory. Measures the reads `listMessages` makes per screen refresh: the newest
 * 100 messages (`order by Timestamp desc, Id desc limit 100`, with the Member join), all
 * reactions and all attachments.
 *
 *   node test/stack/history-scale.mjs                 # 100, 1000, 5000 messages
 *   SIZES=100,2000 node test/stack/history-scale.mjs
 *   INDEX=1 node …                                    # the same schema plus an index on Message(Timestamp)
 *
 * On the S7 a list read took 2.5–4.4 s with a short history; Node is ~5× faster at JS.
 */
import { webSockets } from '@libp2p/websockets';
import { generateKeyPair } from '@libp2p/crypto/keys';
import { MemoryRawStorage } from '@optimystic/db-p2p';
import { CadreNode, InMemoryKeyStore, generateStrandMemberKey } from '@serfab/cadre-core';
import { runOwnerGenesis } from '@serfab/cadre-core/edge-node';
import { getChatSAppConfig } from '@chat/core';
import { randomUUID } from 'node:crypto';

const SIZES = (process.env.SIZES ?? '100,1000,5000').split(',').map(Number);
const INDEX = process.env.INDEX === '1';
const base = getChatSAppConfig();
const sApp = INDEX
  ? { ...base, version: `${base.version}-ix`, schema: `${base.schema}\nindex MessageByTimestamp on Message (Timestamp);` }
  : base;

const scopes = new Map();
const node = new CadreNode({
  privateKey: await generateKeyPair('Ed25519'),
  controlNetwork: { partyId: `scale-${randomUUID()}`, bootstrapNodes: [] },
  profile: 'transaction',
  storage: { provider: s => scopes.get(s) ?? scopes.set(s, new MemoryRawStorage()).get(s) },
  network: { transports: [webSockets()], listenAddrs: [], relayAddrs: [], requireRelay: false },
  requireSignedSchemas: false,
});
await node.start();
await runOwnerGenesis(node, { keyStore: new InMemoryKeyStore(), label: 'scale' });
const founded = await node.foundStrand({ strandId: randomUUID(), type: 'c', memberPrivateKey: await generateStrandMemberKey(), sAppConfig: sApp });
const db = founded.instance.database.getDatabase();
await db.exec(`insert into App.Member (Id, Name) values ('me', 'Me')`);

const stamp = i => new Date(Date.UTC(2026, 0, 1) + i * 1000).toISOString().replace('T', ' ').replace(/Z$/, '');
const time = async (fn, reps = 5) => {
  const ms = [];
  for (let r = 0; r < reps; r++) { const t = performance.now(); await fn(); ms.push(performance.now() - t); }
  ms.sort((a, b) => a - b);
  return ms[Math.floor(ms.length / 2)];
};
const drain = async (sql, params) => { let n = 0; for await (const _ of db.eval(sql, params)) n++; return n; };
const LIST = `select M.Id, M.MemberId, M.Content, M.Timestamp, M.ReplyToId, M.EditedAt, Mem.Name as MemberName
  from App.Message M left join App.Member Mem on Mem.Id = M.MemberId
  order by M.Timestamp desc, M.Id desc limit ?`;

console.log(`schema: chat ${sApp.version}${INDEX ? ' + index on Message(Timestamp)' : ''}`);
console.log('messages | newest 100 (ms) | newest 100, no join (ms) | count(*) (ms) | all reactions (ms) | one more insert (ms) | insert, bare table (ms)');
await db.exec(`create table if not exists App.Bare (Id text primary key, V text not null)`).catch(() => {});
let have = 0;
for (const size of SIZES) {
  while (have < size) {
    const batch = Math.min(200, size - have);
    await db.exec('begin');
    for (let i = 0; i < batch; i++, have++) {
      await db.exec(`insert into App.Message (Id, MemberId, Content, Timestamp, ReplyToId) values (?, 'me', ?, ?, null)`,
        [randomUUID(), `message ${have}`, stamp(have)]);
      if (have % 10 === 0) await db.exec(`insert or ignore into App.Reaction (MessageId, MemberId, Symbol) select Id, 'me', '👍' from App.Message where Content = ?`, [`message ${have}`]);
    }
    await db.exec('commit');
  }
  // SETTLE_S: let the storage finish with the bulk insert before measuring (default 10 s).
  await new Promise(r => setTimeout(r, Number(process.env.SETTLE_S ?? 10) * 1000));
  const list = await time(() => drain(LIST, [100]));
  const reactions = await time(() => drain('select MessageId, MemberId, Symbol from App.Reaction'));
  const noJoin = await time(() => drain('select Id, MemberId, Content, Timestamp from App.Message order by Timestamp desc, Id desc limit 100'));
  const count = await time(() => drain('select count(*) from App.Message'));
  const insert = await time(async () => {
    await db.exec(`insert into App.Message (Id, MemberId, Content, Timestamp, ReplyToId) values (?, 'me', 'one more', ?, null)`, [randomUUID(), stamp(have++)]);
  }, 3);
  // A table of the same size with no foreign key, no tags: is the insert's growth the table's?
  const bareHave = await drain('select Id from App.Bare');
  if (bareHave < size) {
    await db.exec('begin');
    for (let i = bareHave; i < size; i++) await db.exec('insert into App.Bare (Id, V) values (?, ?)', [randomUUID(), `v${i}`]);
    await db.exec('commit');
  }
  await new Promise(r => setTimeout(r, Number(process.env.SETTLE_S ?? 10) * 1000));
  if (process.env.PROFILE && size === SIZES.at(-1)) {
    // PROFILE=<file>: a CPU profile of 20 single inserts into the bare table, nothing else.
    const { Session } = await import('node:inspector/promises');
    const { writeFileSync } = await import('node:fs');
    const session = new Session();
    session.connect();
    await session.post('Profiler.enable');
    await session.post('Profiler.start');
    for (let i = 0; i < 20; i++) await db.exec('insert into App.Bare (Id, V) values (?, ?)', [randomUUID(), 'profiled']);
    const { profile } = await session.post('Profiler.stop');
    writeFileSync(process.env.PROFILE, JSON.stringify(profile));
    console.log(`profile of 20 inserts at ${size} rows -> ${process.env.PROFILE}`);
  }
  const bareInsert = await time(() => db.exec('insert into App.Bare (Id, V) values (?, ?)', [randomUUID(), 'one more']), 3);
  const f = (x, w) => x.toFixed(1).padStart(w);
  console.log(`${String(size).padStart(8)} | ${f(list, 15)} | ${f(noJoin, 25)} | ${f(count, 13)} | ${f(reactions, 18)} | ${f(insert, 20)} | ${f(bareInsert, 24)}`);
}
await node.stop();
process.exit(0);
