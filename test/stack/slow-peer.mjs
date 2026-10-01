/**
 * slow-peer.mjs — when one member of a strand is stalled, how slow are the OTHER
 * member's local reads and writes?
 *
 * WHY. On two phones, one (an emulator short of memory) had its JS thread blocked
 * 50–98% of the time, in single stretches of up to 43 s. The healthy phone's
 * writes then took minutes. That is expected when every commit needs the other
 * member. But its plain local reads (`select … from App.Message`, a few rows it
 * already held) also took 60–200 s, and nothing about a read obviously needs the
 * other phone.
 *
 * WHAT THIS DOES. Two parties in two OS processes, relay-only, with the chat
 * schema. HOST is this process; PEER is a child process, which can block its own
 * event loop on command (STALL_MS of busy work every PERIOD_MS). HOST measures its
 * own reads and writes in three windows:
 *
 *   baseline  peer healthy
 *   stalled   peer blocked STALL_MS of every PERIOD_MS
 *   recovered peer healthy again
 *
 *   RELAY_ADDR=/dns4/relay.sereus.org/tcp/4011/ws/p2p/12D3Koo… node slow-peer.mjs
 *   STALL_MS=8000 PERIOD_MS=10000 WINDOW_MS=120000 RELAY_ADDR=… node slow-peer.mjs
 *
 * Reads are timed every READ_EVERY_MS with nothing else going on. A write is a
 * Message insert every WRITE_EVERY_MS, timed separately.
 */
import { fork } from 'node:child_process';
import { CadreNode, ControlFormationUsageRecorder, generateStrandMemberKey, KeyStoreJoinedStrandStore } from '@serfab/cadre-core';
import { LevelDBRawStorage } from '@optimystic/db-p2p-storage-rn';
import { webSockets } from '@libp2p/websockets';
import { circuitRelayTransport } from '@libp2p/circuit-relay-v2';
import { generateKeyPair, privateKeyToProtobuf, privateKeyFromProtobuf } from '@libp2p/crypto/keys';
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { FileBootstrapPeerStore } from '@serfab/cadre-core/bootstrap-peer-store-file';
import { FileStrandNetworkStateStore } from '@serfab/cadre-core/strand-network-state-file';
import { FileKeyStore } from '@serfab/cadre-core/key-store-file';
import { openTestDb } from './classic-level-driver.mjs';

const ROLE = process.env.SLOW_PEER_ROLE ?? 'host';
const RELAY_ADDR = process.env.RELAY_ADDR;
if (!RELAY_ADDR) { console.error('RELAY_ADDR is required — relay-only, as phones are.'); process.exit(2); }
const STORE_ROOT = process.env.STORE_ROOT ?? join(tmpdir(), 'slow-peer');
const STALL_MS = Number(process.env.STALL_MS ?? 8000);
const PERIOD_MS = Number(process.env.PERIOD_MS ?? 10000);
const WINDOW_MS = Number(process.env.WINDOW_MS ?? 120_000);
const READ_EVERY_MS = Number(process.env.READ_EVERY_MS ?? 2000);
const WRITE_EVERY_MS = Number(process.env.WRITE_EVERY_MS ?? 15_000);
/** Reads at least this slow are logged one by one, with their timing against our writes. */
const SLOW_READ_MS = Number(process.env.SLOW_READ_MS ?? 300);
/** WRITES=0 measures reads alone, to see whether our own writes are what sends reads to the network. */
const WRITES = process.env.WRITES !== '0';
let writing = false, lastWriteEnd = Date.now();
/**
 * PEER_MODE=stall (default) blocks the peer's loop for the middle window.
 * PEER_MODE=offline stops the peer's node instead (the other phone switched off),
 * and there is no "recovered" window.
 * PEER_MODE=return stops the peer, writes LONE_WRITES messages alone, restarts the peer
 * with the same identity and storage, and times how long until it holds them.
 */
const PEER_MODE = process.env.PEER_MODE ?? 'stall';
/** PEER_MODE=return: messages written while the peer is down, how long it stays down after, how long to wait for it. */
const LONE_WRITES = Number(process.env.LONE_WRITES ?? 3);
const OFFLINE_MS = Number(process.env.OFFLINE_MS ?? 20_000);
const RETURN_WAIT_MS = Number(process.env.RETURN_WAIT_MS ?? 180_000);

const here = dirname(fileURLToPath(import.meta.url));
// The chat schema when run from the chat repo; the two tables this script touches otherwise.
const CHAT_SCHEMA_FILE = join(here, '../../design/specs/domain/chat-sapp.qsql');
const SCHEMA = existsSync(CHAT_SCHEMA_FILE)
  ? readFileSync(CHAT_SCHEMA_FILE, 'utf8')
    .replace(/^\s*--[^\n]*\n/gm, '')
    .replace(/^declare\s+schema\s+\w+\s*\{/m, '')
    .replace(/\}\s*$/, '')
    .trim()
  : `table Member (
    Id text primary key,
    Name text not null,
    AvatarUri text null
);
table Message (
    Id text primary key,
    MemberId text not null,
    Content text not null,
    Timestamp datetime not null,
    ReplyToId text null,
    foreign key (MemberId) references Member(Id)
);`;
const SAPP = { id: 'org.sereus.chat', version: '0.1.0', schema: SCHEMA, signature: '', latencyHint: 'interactive' };

const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${ROLE.toUpperCase()}:`, ...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const stamp = () => new Date().toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '');

const openDbs = new Map();
function storageFor(tag) {
  return (scope) => {
    const name = `${tag}-${scope}`;
    let h = openDbs.get(name);
    if (!h) { h = openTestDb(name, 0, STORE_ROOT); openDbs.set(name, h); }
    return new LevelDBRawStorage(h.db);
  };
}

/** A machine keeps its peer id across a restart (PEER_MODE=return restarts the peer). */
async function identityFor(tag) {
  const file = join(STORE_ROOT, `${tag}.key`);
  if (existsSync(file)) return privateKeyFromProtobuf(readFileSync(file));
  const key = await generateKeyPair('Ed25519');
  writeFileSync(file, privateKeyToProtobuf(key));
  return key;
}

/** The app's node configuration (CadreService.ts), minus RN-only noiseCrypto. */
async function startParty(tag, partyId) {
  const node = new CadreNode({
    privateKey: await identityFor(tag),
    controlNetwork: { partyId, bootstrapNodes: [] },
    bootstrapPeers: { store: await FileBootstrapPeerStore.open(join(STORE_ROOT, `${tag}-bootstrap`), partyId) },
    strandNetworkState: { store: await FileStrandNetworkStateStore.open(join(STORE_ROOT, `${tag}-strandnet`), partyId) },
    joinedStrands: { store: new KeyStoreJoinedStrandStore(new FileKeyStore(join(STORE_ROOT, `${tag}-keys`)), partyId) },
    profile: 'transaction',
    strandFilter: { mode: 'sAppId', sAppId: SAPP.id },
    storage: { provider: storageFor(tag) },
    network: {
      transports: [webSockets(), circuitRelayTransport()],
      listenAddrs: [],
      relayAddrs: [RELAY_ADDR],
      requireRelay: false,
      connectionGater: { denyDialMultiaddr: () => false },
    },
    requireSignedSchemas: false,
  });
  await node.start();
  const owner = node.getIdentityOwnerKey();
  await node.getControlDatabase().ensureOwnerKey(owner.publicKeyB64);
  node.initializeSeedBootstrap(owner.privateKeyB64);
  node.initializeStrandSolicitation({
    formationUsageRecorder: new ControlFormationUsageRecorder(node.getControlDatabase()),
  });
  const until = Date.now() + 60_000;
  while (node.getMultiaddrs().length === 0) {
    if (Date.now() > until) throw new Error(`${tag}: no relay reservation after 60 s`);
    await sleep(500);
  }
  return node;
}

const db = inst => inst.database.getDatabase();
const insertMessage = (inst, memberId, content) => db(inst).exec(
  'insert into App.Message (Id, MemberId, Content, Timestamp, ReplyToId) values (?, ?, ?, ?, ?)',
  [randomUUID(), memberId, content, stamp(), null]);

// ───────────────────────────── PEER (child) ─────────────────────────────
if (ROLE === 'peer') {
  let stallTimer = null, stalledMs = 0;
  // The same party across a restart; a restarted peer re-attaches its strand the way
  // the app does, from the joined-strand record cadre-core re-offers at start.
  const node = await startParty('peer', process.env.PEER_PARTY_ID);
  const attaching = new Set();
  node.on('strand:discovered', ({ strandId, strand }) => {
    if (attaching.has(strandId) || node.getStrands().has(strandId)) return;
    attaching.add(strandId);
    void node.addStrand({ strandRow: strand, sAppConfig: SAPP })
      .then(() => { log(`re-attached ${strandId}`); process.send({ type: 'attached' }); })
      .catch(e => log(`re-attach of ${strandId} failed — ${e?.message ?? e}`))
      .finally(() => attaching.delete(strandId));
  });
  // The app keeps its own list of joined strands and re-adds them at boot
  // (chat-strand.ts attachJoinedStrands); so does this peer.
  const joinedFile = join(STORE_ROOT, 'peer-joined.json');
  if (existsSync(joinedFile)) {
    const row = JSON.parse(readFileSync(joinedFile, 'utf8'));
    void node.addStrand({ strandRow: row, sAppConfig: SAPP, founder: false })
      .then(() => log(`re-added joined strand ${row.Id}`))
      .catch(e => log(`re-add of joined strand failed — ${e?.name}: ${e?.message ?? e}`));
  }
  process.send({ type: 'ready' });
  process.on('message', async (m) => {
    try {
      if (m.type === 'join') {
        const formed = await node.formStrand(m.invitation, { partyId: 'peer', purpose: 'slow-peer', metadata: { name: 'Peer' } });
        const row = { Id: formed.strandId, MemberPrivateKey: formed.memberPrivateKey ?? null, Type: 'c', FounderOwnerKey: null };
        writeFileSync(join(STORE_ROOT, 'peer-joined.json'), JSON.stringify(row));
        let inst = node.getStrand(formed.strandId);
        if (!inst) inst = await node.addStrand({ strandRow: row, sAppConfig: SAPP, founder: false });
        while (!inst?.database?.getDatabase?.()) { await sleep(500); inst = node.getStrand(formed.strandId); }
        await db(inst).exec('insert into App.Member (Id, Name, AvatarUri) values (?, ?, ?)', [node.peerId.toString(), 'Peer', null]);
        process.send({ type: 'joined' });
      } else if (m.type === 'stall') {
        // Busy work on THIS process's loop only: no operation is made slower,
        // everything simply waits, as on the starved emulator.
        stallTimer = setInterval(() => {
          const end = Date.now() + STALL_MS;
          while (Date.now() < end) { /* blocked */ }
          stalledMs += STALL_MS;
        }, PERIOD_MS);
        log(`stalling ${STALL_MS} ms of every ${PERIOD_MS} ms`);
      } else if (m.type === 'unstall') {
        clearInterval(stallTimer); stallTimer = null;
        log(`healthy again (${stalledMs / 1000} s blocked in total)`);
      } else if (m.type === 'has') {
        // Which of these message ids does this peer hold? Read locally.
        const inst = node.getStrand(m.strandId);
        const held = [];
        if (inst?.database?.getDatabase?.()) {
          for await (const row of db(inst).eval('select Id from App.Message')) if (m.ids.includes(row.Id)) held.push(row.Id);
        }
        process.send({ type: 'held', held, attached: !!inst?.database });
      } else if (m.type === 'stop') {
        await node.stop();
        process.exit(0);
      }
    } catch (e) {
      process.send({ type: 'error', error: e?.stack ?? String(e) });
    }
  });
} else {
// ───────────────────────────── HOST (measures) ─────────────────────────────
  rmSync(STORE_ROOT, { recursive: true, force: true });
  mkdirSync(STORE_ROOT, { recursive: true });
  const PEER_PARTY_ID = `slowpeer-peer-${randomUUID().slice(0, 8)}`;
  const spawnPeer = () => fork(fileURLToPath(import.meta.url), [], { env: { ...process.env, SLOW_PEER_ROLE: 'peer', STORE_ROOT, PEER_PARTY_ID } });
  let child = spawnPeer();
  const ask = (msg, type) => { const p = next(type); child.send(msg); return p; };
  const next = type => new Promise((res, rej) => {
    const on = m => {
      if (m.type === type) { child.off('message', on); res(m); }
      else if (m.type === 'error') { child.off('message', on); rej(new Error(m.error)); }
    };
    child.on('message', on);
  });
  let code = 0, host;
  try {
    const peerReady = next('ready');
    host = await startParty('host', `slowpeer-host-${randomUUID().slice(0, 8)}`);
    await peerReady;
    log('both parties reachable');

    const strandId = randomUUID();
    const founded = await host.foundStrand({ strandId, type: 'c', memberPrivateKey: await generateStrandMemberKey(), sAppConfig: SAPP });
    const inst = founded.instance;
    const me = host.peerId.toString();
    await db(inst).exec('insert into App.Member (Id, Name, AvatarUri) values (?, ?, ?)', [me, 'Host', null]);
    const invitation = await host.createOpenInvitation(SAPP.id, 60 * 60 * 1000);
    await host.publishFormationInvite(invitation.token, SAPP.id, { expiresAtMs: invitation.expiration.getTime(), strandId });
    const joined = next('joined');
    child.send({ type: 'join', invitation });
    await joined;
    log('peer joined and wrote its Member');
    for (let i = 1; i <= 5; i++) await insertMessage(inst, me, `seed ${i}`);
    log('wrote 5 messages to read back');

    measure: {
    if (PEER_MODE === 'return') {
      // WRITTEN ALONE, THEN THE PEER COMES BACK. Does what was written alone reach it,
      // and how soon? Also: how does that compare with one ordinary write after its return?
      child.send({ type: 'stop' });
      await new Promise(r => child.once('exit', r));
      log('peer offline');
      const lone = [];
      for (let i = 1; i <= LONE_WRITES; i++) {
        const id = randomUUID(), s0 = Date.now();
        for (let attempt = 1; ; attempt++) {
          try {
            await db(inst).exec('insert into App.Message (Id, MemberId, Content, Timestamp, ReplyToId) values (?, ?, ?, ?, ?)',
              [id, me, `alone ${i}`, stamp(), null]);
            break;
          } catch (e) {
            if (attempt >= 5 || !/super-majority/.test(e?.message ?? '')) throw e;
            log(`lone write ${i} attempt ${attempt} failed (${Date.now() - s0} ms): super-majority — retrying, as the app does`);
            await sleep(3000);
          }
        }
        lone.push(id);
        log(`lone write ${i} committed in ${Date.now() - s0} ms`);
      }
      await sleep(OFFLINE_MS);
      const back = Date.now();
      child = spawnPeer();
      await next('ready');
      log(`peer back online after ${(OFFLINE_MS / 1000)} s more (same identity and storage)`);
      let after = null, afterMs = null, heldAt = null, attached = false;
      const until = back + RETURN_WAIT_MS;
      while (Date.now() < until) {
        const r = await ask({ type: 'has', strandId, ids: lone }, 'held');
        attached ||= r.attached;
        if (attached && after === null) {
          // One ordinary write once the peer has its strand back, to compare with.
          after = randomUUID();
          const s0 = Date.now();
          try {
            await db(inst).exec('insert into App.Message (Id, MemberId, Content, Timestamp, ReplyToId) values (?, ?, ?, ?, ?)',
              [after, me, 'after return', stamp(), null]);
            afterMs = Date.now() - s0;
            log(`write after return committed in ${afterMs} ms, ${Date.now() - back} ms after the peer came back`);
          } catch (e) { log(`write after return failed — ${e?.message ?? e}`); }
        }
        if (r.held.length === lone.length && heldAt === null) {
          heldAt = Date.now() - back;
          log(`peer holds all ${lone.length} lone-written messages, ${heldAt} ms after it came back`);
          break;
        }
        await sleep(1000);
      }
      if (heldAt === null) {
        const r = await ask({ type: 'has', strandId, ids: lone }, 'held');
        log(`FINDING: after ${RETURN_WAIT_MS / 1000} s back online the peer holds ${r.held.length} of ${lone.length} lone-written messages (strand attached: ${r.attached})`);
        code = 1;
      }
      break measure;
    }

    /** One window: reads every READ_EVERY_MS and a write every WRITE_EVERY_MS, in parallel. */
    async function window(name) {
      const reads = [], writes = [];
      const end = Date.now() + WINDOW_MS;
      const reader = (async () => {
        while (Date.now() < end) {
          const s = Date.now();
          let n = 0;
          try {
            for await (const _ of db(inst).eval('select Id, Content from App.Message')) n++;
            const ms = Date.now() - s;
            reads.push(ms);
            if (ms >= SLOW_READ_MS) log(`${name}: slow read ${ms} ms (${n} rows), started ${s - lastWriteEnd} ms after our last write ended` + (writing ? ', DURING a write' : ''));
          }
          catch (e) { reads.push(Infinity); log(`${name}: read failed — ${e?.message ?? e}`); }
          await sleep(READ_EVERY_MS);
        }
      })();
      const writer = (async () => {
        if (!WRITES) return;
        let i = 0;
        while (Date.now() < end) {
          const s = Date.now();
          writing = true;
          try { await insertMessage(inst, me, `${name} ${++i}`); writes.push(Date.now() - s); }
          catch (e) { writes.push(Infinity); log(`${name}: write failed after ${Date.now() - s} ms — ${e?.message ?? e}`); }
          writing = false; lastWriteEnd = Date.now();
          await sleep(WRITE_EVERY_MS);
        }
      })();
      await Promise.all([reader, writer]);
      const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : '—'; };
      log(`${name.padEnd(9)} reads: ${reads.length}, median ${q(reads, 0.5)} ms, p90 ${q(reads, 0.9)} ms, max ${q(reads, 1)} ms` +
          `  |  writes: ${writes.length}, median ${q(writes, 0.5)} ms, max ${q(writes, 1)} ms`);
      return { reads, writes };
    }

    const base = await window('baseline');
    let stalled;
    if (PEER_MODE === 'offline') {
      child.send({ type: 'stop' });
      await new Promise(r => child.once('exit', r));
      log('peer node stopped and its process exited (the other phone is off)');
      stalled = await window('offline');
    } else {
      child.send({ type: 'stall' });
      stalled = await window('stalled');
      child.send({ type: 'unstall' });
      await window('recovered');
    }

    const med = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
    if (med(stalled.reads) > 10 * Math.max(med(base.reads), 20)) {
      log(`FINDING: local reads slowed by more than 10x while the OTHER member was ${PEER_MODE === 'offline' ? 'offline' : 'stalled'}.`);
      code = 1;
    } else {
      log('Local reads were not materially affected by the stalled member.');
    }
    } // measure
  } catch (e) {
    log('rig error:', e?.stack ?? e);
    code = 2;
  } finally {
    try { child.send({ type: 'stop' }); } catch { /* gone */ }
    try { await host?.stop(); } catch { /* best effort */ }
    for (const [, h] of openDbs) { try { await h.cleanup(); } catch { /* best effort */ } }
    setTimeout(() => { child.kill(); process.exit(code); }, 3000);
  }
}
