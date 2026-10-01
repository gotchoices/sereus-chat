/**
 * message-latency.mjs — how long does one chat message take, and where does the
 * time go?
 *
 * WHY. On two phones (sereus 1.9, relay only) a message took 108–213 s to reach
 * the other phone even with both apps long up, and 5–10 min right after a
 * restart. The sender sees nothing meanwhile, because its own insert has not
 * returned. This script runs the same exchange in Node, with the chat schema and
 * the app's node configuration, and splits each message into two numbers:
 *
 *   commit   the sender's `exec(insert …)` returning (what blocks the sender's UI)
 *   visible  the row first readable on the OTHER party, polled every POLL_MS
 *
 * Node fast  → the minutes on the phones are React Native / device specific.
 * Node slow  → a pure-Node, single-version repro for upstream.
 *
 *   RELAY_ADDR=/dns4/relay.sereus.org/tcp/4011/ws/p2p/12D3Koo… node message-latency.mjs
 *   ROUNDS=10 RESTART=1 RELAY_ADDR=… node message-latency.mjs
 *   ROUNDS=8 GAP_MS=150000 RELAY_ADDR=… node message-latency.mjs   # idle between messages
 *
 * RESTART=1 then stops both parties, restarts them over the same storage and
 * identity (as two phones whose apps were closed), and measures ROUNDS more.
 */
import { CadreNode, ControlFormationUsageRecorder, generateStrandMemberKey, KeyStoreJoinedStrandStore } from '@serfab/cadre-core';
import { LevelDBRawStorage } from '@optimystic/db-p2p-storage-rn';
import { webSockets } from '@libp2p/websockets';
import { circuitRelayTransport } from '@libp2p/circuit-relay-v2';
import { generateKeyPair, privateKeyToProtobuf, privateKeyFromProtobuf } from '@libp2p/crypto/keys';
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { FileBootstrapPeerStore } from '@serfab/cadre-core/bootstrap-peer-store-file';
import { FileStrandNetworkStateStore } from '@serfab/cadre-core/strand-network-state-file';
import { FileKeyStore } from '@serfab/cadre-core/key-store-file';
import { openTestDb } from './classic-level-driver.mjs';

const RELAY_ADDR = process.env.RELAY_ADDR;
if (!RELAY_ADDR) { console.error('RELAY_ADDR is required — relay-only, as phones are.'); process.exit(2); }
const STORE_ROOT = process.env.STORE_ROOT ?? join(tmpdir(), 'message-latency');
const ROUNDS = Number(process.env.ROUNDS ?? 6);
const RESTART = process.env.RESTART === '1';
const POLL_MS = Number(process.env.POLL_MS ?? 250);
const VISIBLE_MS = Number(process.env.VISIBLE_MS ?? 300_000);
const REACHABLE_MS = Number(process.env.REACHABLE_MS ?? 60_000);
/** Idle time between messages. People don't chat in a tight loop; links idle out. */
const GAP_MS = Number(process.env.GAP_MS ?? 0);
/**
 * How a send writes, to compare the app's shape against a bundled one:
 *   message  the Message insert alone (the floor)
 *   app      what SereusAdapter.send did: Member insert-or-ignore, Member update, Message
 *            insert — three statements, three separate commits
 *   bundled  the same three statements in ONE transaction
 *   check    read the Member row first; write it only if missing or renamed, then the Message
 */
const SEND_MODE = process.env.SEND_MODE ?? 'message';

// The chat schema exactly as the app applies it (chat-sapp.ts extractInnerDDL).
const here = dirname(fileURLToPath(import.meta.url));
const SCHEMA = readFileSync(join(here, '../../design/specs/domain/chat-sapp.qsql'), 'utf8')
  .replace(/^\s*--[^\n]*\n/gm, '')
  .replace(/^declare\s+schema\s+\w+\s*\{/m, '')
  .replace(/\}\s*$/, '')
  .trim();
const SAPP = { id: 'org.sereus.chat', version: '0.1.0', schema: SCHEMA, signature: '', latencyHint: 'interactive' };

const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const mem = label => {
  const m = process.memoryUsage();
  log(`memory ${label}: heapUsed ${Math.round(m.heapUsed / 1048576)} MB, rss ${Math.round(m.rss / 1048576)} MB (both parties, one process)`);
};

rmSync(STORE_ROOT, { recursive: true, force: true });
mkdirSync(STORE_ROOT, { recursive: true });

async function identityFor(tag) {
  const file = join(STORE_ROOT, `${tag}.key`);
  if (existsSync(file)) return privateKeyFromProtobuf(readFileSync(file));
  const key = await generateKeyPair('Ed25519');
  writeFileSync(file, privateKeyToProtobuf(key));
  return key;
}

const openDbs = new Map();
function storageFor(tag) {
  return (scope) => {
    const name = `${tag}-${scope}`;
    let h = openDbs.get(name);
    if (!h) { h = openTestDb(name, 0, STORE_ROOT); openDbs.set(name, h); }
    return new LevelDBRawStorage(h.db);
  };
}
async function closeDbsFor(tag) {
  for (const [name, h] of openDbs) {
    if (!name.startsWith(`${tag}-`)) continue;
    try { await h.cleanup(); } catch { /* best effort */ }
    openDbs.delete(name);
  }
}

function autoAttach(node, tag) {
  const attaching = new Set();
  node.on('strand:discovered', ({ strandId, strand }) => {
    if (attaching.has(strandId) || node.getStrands().has(strandId)) return;
    attaching.add(strandId);
    void node.addStrand({ strandRow: strand, sAppConfig: SAPP })
      .then(() => log(`${tag}: attached ${strandId}`))
      .catch(e => log(`${tag}: attach of ${strandId} failed — ${e?.message ?? e}`))
      .finally(() => attaching.delete(strandId));
  });
}

// The app's node configuration (CadreService.ts), minus what only RN has
// (noiseCrypto) and with the app's strand filter.
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
  autoAttach(node, tag);
  await node.start();
  const owner = node.getIdentityOwnerKey();
  await node.getControlDatabase().ensureOwnerKey(owner.publicKeyB64);
  node.initializeSeedBootstrap(owner.privateKeyB64);
  node.initializeStrandSolicitation({
    formationUsageRecorder: new ControlFormationUsageRecorder(node.getControlDatabase()),
  });
  return node;
}

async function awaitReachable(node, tag) {
  const until = Date.now() + REACHABLE_MS;
  while (Date.now() < until) {
    if (node.getMultiaddrs().length > 0) { log(`${tag}: reachable`); return true; }
    await sleep(500);
  }
  log(`${tag}: no relay reservation after ${REACHABLE_MS / 1000}s`);
  return false;
}

async function awaitStrand(node, strandId, tag, ms = 180_000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const inst = node.getStrand(strandId);
    if (inst?.database?.getDatabase?.()) return inst;
    await sleep(500);
  }
  throw new Error(`${tag}: strand ${strandId} not attached after ${ms / 1000}s`);
}

const db = inst => inst.database.getDatabase();
async function hasMessage(inst, id) {
  const it = db(inst).eval('select Id from App.Message where Id = ?', [id])[Symbol.asyncIterator]();
  const s = await it.next();
  await it.return?.();
  return !s.done;
}
const stamp = () => new Date().toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '');

/** One message from `from` to `to`. Returns { commitMs, visibleMs | null, error }. */
async function oneMessage(from, to, memberId, label) {
  const id = randomUUID();
  const s = Date.now();
  let commitMs = null, error = null;
  const visibleP = (async () => {
    while (Date.now() - s < VISIBLE_MS) {
      try { if (await hasMessage(to, id)) return Date.now() - s; } catch { /* keep polling */ }
      await sleep(POLL_MS);
    }
    return null;
  })();
  try {
    const d = db(from);
    const msg = () => d.exec(
      'insert into App.Message (Id, MemberId, Content, Timestamp, ReplyToId) values (?, ?, ?, ?, ?)',
      [id, memberId, label, stamp(), null]);
    const member = async () => {
      await d.exec('insert or ignore into App.Member (Id, Name) values (?, ?)', [memberId, 'Same Name']);
      await d.exec('update App.Member set Name = ? where Id = ?', ['Same Name', memberId]);
    };
    if (SEND_MODE === 'app') { await member(); await msg(); }
    else if (SEND_MODE === 'check') {
      const it = d.eval('select Name from App.Member where Id = ?', [memberId])[Symbol.asyncIterator]();
      const r = await it.next(); await it.return?.();
      if (r.done || r.value.Name !== 'Same Name') await member();
      await msg();
    }
    else if (SEND_MODE === 'bundled') {
      await d.exec('begin');
      try { await member(); await msg(); await d.exec('commit'); }
      catch (e) { try { await d.exec('rollback'); } catch { /* already gone */ } throw e; }
    } else await msg();
    commitMs = Date.now() - s;
  } catch (e) { error = e?.message ?? String(e); }
  const visibleMs = error ? null : await visibleP;
  log(`${label}: commit ${commitMs ?? '—'} ms, visible on the other side ${visibleMs ?? 'NEVER'} ms` +
      (error ? ` — insert FAILED: ${error}` : ''));
  return { commitMs, visibleMs, error };
}

function summary(name, rs) {
  const ok = rs.filter(r => r.commitMs != null);
  const vis = rs.filter(r => r.visibleMs != null).map(r => r.visibleMs).sort((a, b) => a - b);
  const com = ok.map(r => r.commitMs).sort((a, b) => a - b);
  const med = a => a.length ? a[Math.floor(a.length / 2)] : '—';
  log(`${name}: ${rs.length} messages, ${rs.length - ok.length} failed inserts, ` +
      `${rs.length - vis.length} never visible; commit median ${med(com)} ms (max ${com.at(-1) ?? '—'}), ` +
      `visible median ${med(vis)} ms (max ${vis.at(-1) ?? '—'})`);
}

async function exchange(name, hostInst, joinerInst, hostMember, joinerMember) {
  const rs = [];
  for (let i = 1; i <= ROUNDS; i++) {
    if (i > 1 && GAP_MS) await sleep(GAP_MS);
    const hostTurn = i % 2 === 1;
    rs.push(await oneMessage(hostTurn ? hostInst : joinerInst, hostTurn ? joinerInst : hostInst,
      hostTurn ? hostMember : joinerMember, `${name} #${i} ${hostTurn ? 'host→joiner' : 'joiner→host'}`));
  }
  summary(name, rs);
  return rs;
}

const partyHost = `lat-host-${randomUUID().slice(0, 8)}`;
const partyJoiner = `lat-joiner-${randomUUID().slice(0, 8)}`;
let host, joiner, code = 0;
try {
  host = await startParty('host', partyHost);
  joiner = await startParty('joiner', partyJoiner);
  if (!await awaitReachable(host, 'HOST') || !await awaitReachable(joiner, 'JOINER')) process.exit(3);

  const strandId = randomUUID();
  const founded = await host.foundStrand({ strandId, type: 'c', memberPrivateKey: await generateStrandMemberKey(), sAppConfig: SAPP });
  const hostMember = host.peerId.toString();
  await db(founded.instance).exec('insert into App.Member (Id, Name, AvatarUri) values (?, ?, ?)', [hostMember, 'Host', null]);
  const invitation = await host.createOpenInvitation(SAPP.id, 60 * 60 * 1000);
  await host.publishFormationInvite(invitation.token, SAPP.id, { expiresAtMs: invitation.expiration.getTime(), strandId });
  log(`HOST: founded ${strandId}, wrote its Member, published an invitation`);

  const f0 = Date.now();
  const formed = await joiner.formStrand(invitation, { partyId: partyJoiner, purpose: 'latency', metadata: { name: 'Joiner' } });
  log(`JOINER: formed in ${Date.now() - f0} ms`);
  let joinerInst = joiner.getStrand(strandId) ?? await joiner.addStrand({
    strandRow: { Id: formed.strandId, MemberPrivateKey: formed.memberPrivateKey ?? null, Type: 'c', FounderOwnerKey: null },
    sAppConfig: SAPP, founder: false,
  });
  joinerInst = await awaitStrand(joiner, strandId, 'JOINER');
  const joinerMember = joiner.peerId.toString();
  const m0 = Date.now();
  await db(joinerInst).exec('insert into App.Member (Id, Name, AvatarUri) values (?, ?, ?)', [joinerMember, 'Joiner', null]);
  log(`JOINER: wrote its Member in ${Date.now() - m0} ms`);

  mem('after setup');
  const warm = await exchange('fresh', founded.instance, joinerInst, hostMember, joinerMember);
  if (warm.some(r => r.visibleMs == null)) code = 1;
  mem('after exchange');

  if (RESTART) {
    log('Stopping both parties (two apps closed), then restarting over the same storage');
    await host.stop(); await joiner.stop();
    await closeDbsFor('host'); await closeDbsFor('joiner');
    const r0 = Date.now();
    host = await startParty('host', partyHost);
    joiner = await startParty('joiner', partyJoiner);
    if (!await awaitReachable(host, 'HOST') || !await awaitReachable(joiner, 'JOINER')) process.exit(3);
    const h2 = await awaitStrand(host, strandId, 'HOST');
    const j2 = await awaitStrand(joiner, strandId, 'JOINER');
    log(`both re-attached ${Date.now() - r0} ms after restart`);
    const after = await exchange('restarted', h2, j2, hostMember, joinerMember);
    if (after.some(r => r.visibleMs == null)) code = 1;
  }
} catch (e) {
  log('rig error:', e?.stack ?? e);
  code = 2;
} finally {
  try { await host?.stop(); } catch { /* best effort */ }
  try { await joiner?.stop(); } catch { /* best effort */ }
  for (const [, h] of openDbs) { try { await h.cleanup(); } catch { /* best effort */ } }
}
process.exit(code);
