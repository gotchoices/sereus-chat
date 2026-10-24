/**
 * Where founding and joining a strand spend their time, step by step, on bare
 * cadre-core: no chat code, no phone. Written as an upstream repro.
 *
 * Two parties in one Node process, phone-shaped by default: neither listens; both
 * reach each other only through an in-process circuit relay on loopback. Block
 * storage is in memory, so disk plays no part. Founding involves ONE member, so
 * everything it costs is the founder's own work and its own waits.
 *
 *   node test/stack/formation-cost.mjs                 # relay-only (as phones)
 *   DIRECT=1 node test/stack/formation-cost.mjs        # both listen on loopback, no relay
 *   RELAY_ADDR=/dns4/relay.sereus.org/tcp/4011/ws/p2p/<id> node …   # a real relay instead of loopback
 *   RUNS=3 node test/stack/formation-cost.mjs          # found/join this many strands in turn
 *   DEBUG='optimystic*' node test/stack/formation-cost.mjs 2>debug.log   # the stack's own log
 *   node --cpu-prof --cpu-prof-dir=prof test/stack/formation-cost.mjs    # CPU profile
 *   MESSAGES=30 node test/stack/formation-cost.mjs     # then N more steady-state writes, timed
 *   FOUND_ONLY=10 node test/stack/formation-cost.mjs   # one party founds N strands in a row, nothing else
 *   TRACE_SQL=1 FOUND_ONLY=3 node test/stack/formation-cost.mjs  # count the SQL quereus is given per step
 *   IDLE_S=180 DEBUG='optimystic:fret*' node …          # then sit idle (FRET's backoff, idle traffic)
 *   SHOW_LIMITS=1 node …                                # list each connection, relayed or direct, and its relay limits
 *   OVERLAP=1 node …                                    # blocks a join push delivered vs. the sync requests that follow
 *
 * Prints one line per step with its duration, and the event loop's own CPU use per
 * step (process.cpuUsage), so "waiting" and "working" can be told apart.
 */
import { createLibp2p } from 'libp2p';
import { webSockets } from '@libp2p/websockets';
import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { identify } from '@libp2p/identify';
import { circuitRelayServer, circuitRelayTransport } from '@libp2p/circuit-relay-v2';
import { generateKeyPair } from '@libp2p/crypto/keys';
import { BlockTransferService, MemoryRawStorage, SyncService } from '@optimystic/db-p2p';
import { CadreNode, generateStrandMemberKey, InMemoryKeyStore } from '@serfab/cadre-core';
import { runOwnerGenesis } from '@serfab/cadre-core/edge-node';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Database } from '@quereus/quereus';

const DIRECT = process.env.DIRECT === '1';
// TRACE_SQL: count every statement handed to quereus (prepare/exec/eval/get), by text.
const sqlSeen = new Map();
if (process.env.TRACE_SQL) {
  for (const method of ['prepare', 'exec', 'eval', 'get']) {
    const original = Database.prototype[method];
    Database.prototype[method] = function (sql, ...rest) {
      const key = `${method}: ${String(sql).replace(/\s+/g, ' ').slice(0, 110)}`;
      sqlSeen.set(key, (sqlSeen.get(key) ?? 0) + 1);
      return original.call(this, sql, ...rest);
    };
  }
}
function dumpSql(label) {
  if (!process.env.TRACE_SQL) return;
  const total = [...sqlSeen.values()].reduce((a, b) => a + b, 0);
  console.log(`  SQL during ${label}: ${total} statements, ${sqlSeen.size} distinct`);
  for (const [k, n] of [...sqlSeen].sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log(`    ${String(n).padStart(4)}× ${k}`);
  sqlSeen.clear();
}
// OVERLAP: which blocks a join push delivered, and which blocks the pusher is then asked
// to check (sync requests, by kind), per strand. Both services run in this process.
const pushedTo = new Map(); // strand protocol prefix → { at, ids }
const syncAsked = [];       // { strand, blockId, kind, at, step }
let currentStep = '';
if (process.env.OVERLAP) {
  const strandOf = protocol => String(protocol).replace(/\/db-p2p\/.*$/, '');
  const origPush = BlockTransferService.prototype.handlePush;
  BlockTransferService.prototype.handlePush = async function (request, sender) {
    const response = await origPush.call(this, request, sender);
    if (request.type === 'push') {
      const entry = pushedTo.get(strandOf(this.protocol)) ?? { at: Date.now(), ids: new Set(), node: this.registrar };
      for (const id of Object.keys(response.blocks ?? {})) entry.ids.add(id);
      pushedTo.set(strandOf(this.protocol), entry);
    }
    return response;
  };
  for (const [method, kind] of [['answerConsult', 'consult'], ['answerArchive', 'archive']]) {
    const original = SyncService.prototype[method];
    SyncService.prototype[method] = function (request, ...rest) {
      syncAsked.push({ strand: strandOf(this.protocol), blockId: request.blockId, kind, at: Date.now(), step: currentStep, node: this.registrar });
      return original.call(this, request, ...rest);
    };
  }
}
function reportOverlap() {
  if (!process.env.OVERLAP) return;
  console.log('\nblocks pushed to the joiner, and sync requests the pusher answered afterwards (per strand):');
  for (const [strand, push] of pushedTo) {
    // Answered by the pusher, i.e. asked by the joiner: not the joiner's own sync service.
    const after = syncAsked.filter(s => s.strand === strand && s.at >= push.at && s.node !== push.node);
    const joinerAnswered = syncAsked.filter(s => s.strand === strand && s.at >= push.at && s.node === push.node).length;
    const ofPushed = after.filter(s => push.ids.has(s.blockId));
    const kinds = after.reduce((m, s) => (m[s.kind] = (m[s.kind] ?? 0) + 1, m), {});
    const within10s = ofPushed.filter(s => s.at - push.at <= 10_000).length;
    const bySteps = ofPushed.reduce((m, s) => (m[s.step] = (m[s.step] ?? 0) + 1, m), {});
    console.log(`  ${strand.slice(-36)}: pushed ${push.ids.size}; then ${after.length} sync requests ${JSON.stringify(kinds)}, ` +
      `${ofPushed.length} for pushed blocks (${new Set(ofPushed.map(s => s.blockId)).size} distinct, ${within10s} within 10 s of the push) by step ${JSON.stringify(bySteps)}; the joiner answered ${joinerAnswered}`);
  }
}
const RUNS = Number(process.env.RUNS ?? 2);
const SAPP_ID = 'org.example.formation-cost';
const SAPP = {
  id: SAPP_ID,
  version: '0.1.0',
  // Two tables, like a chat: who is here, and what they said.
  schema: `
    table Member (Id text primary key, Name text not null) with tags ("optimystic.network_watch" = true);
    table Message (Id text primary key, MemberId text not null, Content text not null) with tags ("optimystic.network_watch" = true);
  `,
  signature: '',
  latencyHint: 'interactive',
};

const t0 = Date.now();
const stamp = () => `${((Date.now() - t0) / 1000).toFixed(2)}s`;
const rows = [];

/** Time one step: wall clock, and this process's CPU over the same span. */
async function step(who, what, fn) {
  if (process.env.DEBUG) process.stderr.write(`\n#### ${new Date().toISOString()} BEGIN ${who} ${what}\n`);
  currentStep = `${who} ${what}`;
  const wall = Date.now();
  const cpu = process.cpuUsage();
  const value = await fn();
  const used = process.cpuUsage(cpu);
  const ms = Date.now() - wall;
  const cpuMs = Math.round((used.user + used.system) / 1000);
  rows.push({ who, what, ms, cpuMs });
  if (process.env.DEBUG) process.stderr.write(`#### ${new Date().toISOString()} END ${who} ${what} ${ms} ms\n`);
  console.log(`[${stamp()}] ${who.padEnd(7)} ${what.padEnd(44)} ${String(ms).padStart(6)} ms  (cpu ${cpuMs} ms)`);
  return value;
}

async function startRelay() {
  const relay = await createLibp2p({
    addresses: { listen: ['/ip4/127.0.0.1/tcp/0/ws'] },
    transports: [webSockets()],
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()],
    connectionGater: { denyDialMultiaddr: () => false },
    services: { identify: identify(), relay: circuitRelayServer({ reservations: { applyDefaultLimit: false } }) },
  });
  return { addr: relay.getMultiaddrs().map(String).find(a => a.includes('/ws')), stop: () => relay.stop() };
}

async function makeParty(tag, relayAddr) {
  const node = new CadreNode({
    privateKey: await generateKeyPair('Ed25519'),
    controlNetwork: { partyId: `${tag}-${randomUUID()}`, bootstrapNodes: [] },
    profile: 'transaction',
    strandFilter: { mode: 'all' },
    storage: { provider: () => new MemoryRawStorage() },
    network: {
      transports: [webSockets(), circuitRelayTransport()],
      listenAddrs: DIRECT ? ['/ip4/127.0.0.1/tcp/0/ws'] : [],
      relayAddrs: DIRECT ? [] : [relayAddr],
      requireRelay: false,
      connectionGater: { denyDialMultiaddr: () => false },
    },
    hibernation: { enabled: false },
    requireSignedSchemas: false,
  });
  await step(tag, 'node.start()', () => node.start());
  await step(tag, 'owner genesis (runOwnerGenesis)', async () => {
    const result = await runOwnerGenesis(node, { keyStore: new InMemoryKeyStore(), label: tag });
    if (result !== 'enrolled') throw new Error(`${tag}: owner genesis ${result}`);
  });
  await step(tag, 'reachable (an address to be dialled at)', async () => {
    while (node.getMultiaddrs().length === 0) await new Promise(r => setTimeout(r, 50));
  });
  return node;
}

const relay = DIRECT ? null : process.env.RELAY_ADDR ? { addr: process.env.RELAY_ADDR, stop: async () => {} } : await startRelay();
const version = name => { const main = new URL(import.meta.resolve(name)).pathname; const dir = main.slice(0, main.lastIndexOf(`node_modules/${name}/`) + `node_modules/${name}/`.length); return JSON.parse(readFileSync(`${dir}package.json`, 'utf8')).version; };
console.log(`stack: cadre-core ${version('@serfab/cadre-core')}, db-p2p ${version('@optimystic/db-p2p')}, topology ${DIRECT ? 'direct (loopback listen)' : process.env.RELAY_ADDR ? `relay-only (${process.env.RELAY_ADDR.split('/')[2]})` : 'relay-only (loopback relay)'}`);
const A = await makeParty('founder', relay?.addr);
const FOUND_ONLY = Number(process.env.FOUND_ONLY ?? 0);
if (FOUND_ONLY > 0) {
  // Founding alone: one member, so all of it is the founder's own work and waits.
  dumpSql('start-up');
  for (let i = 1; i <= FOUND_ONLY; i++) {
    await step('founder', `foundStrand #${i}`, async () =>
      A.foundStrand({ strandId: `strand-${randomUUID()}`, type: 'c', memberPrivateKey: await generateStrandMemberKey(), sAppConfig: SAPP }));
    dumpSql(`foundStrand #${i}`);
    // sereus 1.17 (#49): the same, returning once the row is published; then the start.
    let ready;
    await step('founder', `foundStrand #${i} background: published`, async () => {
      ({ ready } = await A.foundStrand({ strandId: `strand-${randomUUID()}`, type: 'c', memberPrivateKey: await generateStrandMemberKey(), sAppConfig: SAPP }, { background: true }));
    });
    await step('founder', `foundStrand #${i} background: ready`, () => ready);
  }
  await A.stop();
  await relay?.stop();
  process.exit(0);
}
const B = await makeParty('joiner', relay?.addr);

for (let run = 1; run <= RUNS; run++) {
  console.log(`\n── run ${run} ──`);
  const strandId = `strand-${randomUUID()}`;
  const founded = await step('founder', 'foundStrand (closed)', async () =>
    A.foundStrand({ strandId, type: 'c', memberPrivateKey: await generateStrandMemberKey(), sAppConfig: SAPP }));
  const aDb = founded.instance.database.getDatabase();
  await step('founder', 'first row (own Member)', () =>
    aDb.exec(`insert into App.Member (Id, Name) values ('a', 'A')`, undefined, { transaction: true }));
  await step('founder', 'second row (a Message)', () =>
    aDb.exec(`insert into App.Message (Id, MemberId, Content) values ('m0', 'a', 'hello')`, undefined, { transaction: true }));
  const invitation = await step('founder', 'createOpenInvitation', () => A.createOpenInvitation(SAPP_ID, 3_600_000));
  await step('founder', 'publishFormationInvite', () =>
    A.publishFormationInvite(invitation.token, SAPP_ID, { strandId, expiresAtMs: Date.now() + 3_600_000, totalUses: 1 }));
  const code = A.encodeInvitation(invitation);

  const formed = await step('joiner', 'formStrand', () => B.formStrand(B.decodeInvitation(code), { metadata: { name: 'B' } }));
  const row = { Id: formed.strandId, MemberPrivateKey: formed.memberPrivateKey ?? null, Type: 'c', FounderOwnerKey: null, FounderPeerId: null };
  await step('joiner', 'addStrand (no first-sync wait)', () => B.addStrand({ strandRow: row, sAppConfig: SAPP, awaitFirstSync: false }));
  const bInst = await step('joiner', 'whenStrandWritable', () => B.whenStrandWritable(formed.strandId, { timeoutMs: 300_000 }));
  const bDb = bInst.database.getDatabase();
  await step('joiner', 'first row (own Member)', () =>
    bDb.exec(`insert into App.Member (Id, Name) values ('b', 'B')`, undefined, { transaction: true }));
  await step('founder', "sees the joiner's row", async () => {
    for (;;) {
      let n = 0;
      for await (const _ of aDb.eval('select Id from App.Member')) n++;
      if (n === 2) return;
      await new Promise(r => setTimeout(r, 100));
    }
  });
  await step('joiner', 'a Message (steady-state write)', () =>
    bDb.exec(`insert into App.Message (Id, MemberId, Content) values ('m1', 'b', 'hi')`, undefined, { transaction: true }));
}

const MESSAGES = Number(process.env.MESSAGES ?? 0);
if (MESSAGES > 0) {
  // Steady state on the last strand: the joiner writes N small rows one after another.
  const last = [...B.getStrands().values()].at(-1);
  const db = last.database.getDatabase();
  const times = [];
  const cpu0 = process.cpuUsage();
  const wall0 = Date.now();
  for (let i = 0; i < MESSAGES; i++) {
    if (process.env.DEBUG) process.stderr.write(`\n#### ${new Date().toISOString()} BEGIN message ${i}\n`);
    const t = Date.now();
    await db.exec(`insert into App.Message (Id, MemberId, Content) values ('s${i}', 'b', 'message ${i}')`, undefined, { transaction: true });
    times.push(Date.now() - t);
    if (process.env.DEBUG) process.stderr.write(`#### ${new Date().toISOString()} END message ${i} ${Date.now() - t} ms\n`);
  }
  const used = process.cpuUsage(cpu0);
  times.sort((x, y) => x - y);
  console.log(`\n${MESSAGES} steady-state writes by the joiner: median ${times[times.length >> 1]} ms, min ${times[0]}, max ${times.at(-1)}; ` +
    `CPU ${Math.round((used.user + used.system) / 1000 / MESSAGES)} ms per write over ${Math.round((Date.now() - wall0) / MESSAGES)} ms wall`);
}

const IDLE_S = Number(process.env.IDLE_S ?? 0);
if (IDLE_S > 0) {
  // Leave everything running and idle, e.g. to watch FRET's maintenance back off.
  console.log(`\nidle ${IDLE_S} s…`);
  // Count the streams both parties open while idle, by protocol: every stream between
  // the two has an opener on one side, so outbound alone counts each once.
  const opened = new Map();
  let counting = true;
  const watch = conn => {
    if (conn.__counted) return;
    conn.__counted = true;
    const original = conn.newStream.bind(conn);
    conn.newStream = (protocols, ...rest) => {
      if (counting) {
        const p = [protocols].flat()[0];
        opened.set(p, (opened.get(p) ?? 0) + 1);
      }
      return original(protocols, ...rest);
    };
  };
  const nodesOf = party => [party.getControlNode(), ...[...party.getStrands()].map(([, s]) => s.libp2pNode)].filter(Boolean);
  for (const node of [...nodesOf(A), ...nodesOf(B)]) {
    for (const c of node.getConnections()) watch(c);
    node.addEventListener('connection:open', e => watch(e.detail));
  }
  if (process.env.DEBUG) process.stderr.write(`\n#### ${new Date().toISOString()} BEGIN idle\n`);
  await new Promise(r => setTimeout(r, IDLE_S * 1000));
  if (process.env.DEBUG) process.stderr.write(`#### ${new Date().toISOString()} END idle\n`);
  counting = false;
  const total = [...opened.values()].reduce((a, b) => a + b, 0);
  console.log(`streams opened while idle, both parties: ${total}`);
  for (const [p, n] of [...opened].sort((x, y) => y[1] - x[1])) console.log(`  ${String(n).padStart(4)}  ${p}`);
}

if (process.env.SHOW_LIMITS) {
  // Relayed connections the relay limits (circuit-relay-v2 `limit`: data and/or duration).
  for (const [who, party] of [['founder', A], ['joiner', B]]) {
    const nodes = [['control', party.getControlNode()], ...[...party.getStrands()].map(([id, s]) => [id.slice(0, 15), s.libp2pNode])];
    for (const [label, node] of nodes) {
      for (const c of node?.getConnections() ?? []) {
        console.log(`${who} ${label} → ${c.remotePeer.toString().slice(-6)} ${c.remoteAddr.toString().includes('p2p-circuit') ? 'relayed' : 'direct'} limits=${JSON.stringify(c.limits ?? null, (k, v) => typeof v === 'bigint' ? Number(v) : v)}`);
      }
    }
  }
}

reportOverlap();
console.log('\nsummary (ms, by step, all runs):');
const by = new Map();
for (const r of rows) {
  const k = `${r.who} ${r.what}`;
  by.set(k, [...(by.get(k) ?? []), `${r.ms}/${r.cpuMs}cpu`]);
}
for (const [k, v] of by) console.log(`  ${k.padEnd(54)} ${v.join('  ')}`);
await Promise.allSettled([A.stop(), B.stop()]);
await relay?.stop();
process.exit(0);
