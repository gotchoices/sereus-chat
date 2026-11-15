/**
 * Phone to phone over WebRTC, in Node: two parties set up like phones (no listen address, a relay
 * reservation, the WebRTC transport), a circuit relay between them. Does a strand form between
 * them, do their connections go direct, and what does a 1 MB write cost each way?
 *
 *   node webrtc-phone-to-phone.mjs                 # relay only (today's phones)
 *   WEBRTC=1 node webrtc-phone-to-phone.mjs        # + webRTC() and listening on /webrtc
 *   WEBRTC=1 LISTEN_WEBRTC=0 node …                # the transport without /webrtc listening
 *   WEBRTC=1 ICE_FAIL=1 node …                     # WebRTC signals but can never connect (relay-only
 *                                                  # ICE, no TURN): does everything fall back?
 *   OFFLINE=1 …                                    # strand offline mode
 *   HIBERNATE=1 …                                  # a write each way, then B's strand hibernates
 *                                                  # for 10 s (a phone in the background) and
 *                                                  # wakes, then a write each way again
 *   RELAY=/dns4/relay.sereus.org/tcp/4011/ws/p2p/<id> WEBRTC=1 …   # a real relay, its STUN server
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { webSockets } from '@libp2p/websockets';
import { CadreNode, DEFAULT_IDENTITY_KEY_ID, generateStrandMemberKey, resolveStunServers } from '@serfab/cadre-core';
import { FileKeyStore } from '@serfab/cadre-core/key-store-file';
import { runOwnerGenesis } from '@serfab/cadre-core/edge-node';
import { FileTrustedOwnerStore } from '@serfab/cadre-core/trusted-owner-store-file';
import { FileBootstrapPeerStore } from '@serfab/cadre-core/bootstrap-peer-store-file';
import { FileEnrolledMachineStore } from '@serfab/cadre-core/enrolled-machine-store-file';
import { FileStrandNetworkStateStore } from '@serfab/cadre-core/strand-network-state-file';
import { FileKVStore, FileRawStorage } from '@optimystic/db-p2p-storage-fs';
import { circuitRelayServer, circuitRelayTransport } from '@libp2p/circuit-relay-v2';
import { webRTC } from '@libp2p/webrtc';
import { identify } from '@libp2p/identify';
import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { createLibp2p } from 'libp2p';
import { randomBytes, createHash } from 'node:crypto';

const WEBRTC = process.env.WEBRTC === '1';
const LISTEN_WEBRTC = process.env.LISTEN_WEBRTC !== '0';
const OFFLINE = process.env.OFFLINE === '1';
const ICE_FAIL = process.env.ICE_FAIL === '1';
const HIBERNATE = process.env.HIBERNATE === '1';
const SAPP_ID = 'org.example.p2p-webrtc';
const sApp = { id: SAPP_ID, version: '1.0.0', signature: '', latencyHint: 'interactive',
  schema: 'table Note (Id text primary key, Bytes blob not null);' };
const root = mkdtempSync(join(tmpdir(), 'p2p-webrtc-'));
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);
console.info = () => {}; console.warn = () => {}; console.debug = () => {};

const relay = await createLibp2p({
  addresses: { listen: ['/ip4/127.0.0.1/tcp/0/ws'] },
  transports: [webSockets()], connectionEncrypters: [noise()], streamMuxers: [yamux()],
  connectionGater: { denyDialMultiaddr: () => false },
  services: { identify: identify(), relay: circuitRelayServer({ reservations: { applyDefaultLimit: false } }) },
});
// RELAY=<multiaddr>: a real relay (and its STUN server) instead of the in-process one.
const relayAddr = process.env.RELAY ?? relay.getMultiaddrs().map(a => a.toString()).find(a => a.includes('/ws'));

async function party(tag, partyId, relayAddr) {
  const dir = join(root, tag);
  const keyStore = new FileKeyStore(join(dir, 'keys'));
  const journals = new Map();
  const built = [];
  const node = new CadreNode({
    keyStore, identityKeyId: DEFAULT_IDENTITY_KEY_ID,
    controlNetwork: { partyId, bootstrapNodes: [] },
    profile: 'transaction',
    // The embedder that builds a store closes it (Optimystic IRawStorage.close), below.
    storage: { provider: scope => { const st = new FileRawStorage(join(dir, 'blocks', scope)); built.push(st); return st; } },
    // A PHONE: no listen address of its own; reachable only through the relay (a reservation
    // earns it `<relay>/p2p-circuit`), plus `/webrtc` with WEBRTC=1, as the kit's browser does.
    network: {
      transports: [webSockets(), circuitRelayTransport(),
        ...(WEBRTC ? [webRTC({ rtcConfiguration: ICE_FAIL
          ? { iceServers: [], iceTransportPolicy: 'relay' }
          : { iceServers: resolveStunServers([relayAddr]) } })] : [])],
      listenAddrs: WEBRTC && LISTEN_WEBRTC ? ['/webrtc'] : [],
      relayAddrs: [relayAddr], requireRelay: false,
      connectionGater: { denyDialMultiaddr: () => false },
    },
    strandFilter: { mode: 'sAppId', sAppId: SAPP_ID },
    hibernation: { enabled: false },
    requireSignedSchemas: false,
    trustedOwners: { store: await FileTrustedOwnerStore.open(join(dir, 'node'), partyId) },
    bootstrapPeers: { store: await FileBootstrapPeerStore.open(join(dir, 'node'), partyId) },
    enrolledMachines: { store: await FileEnrolledMachineStore.open(join(dir, 'node'), partyId) },
    strandNetworkState: { store: await FileStrandNetworkStateStore.open(join(dir, 'node'), partyId) },
    ...(OFFLINE ? { strandOffline: {
      journal: scope => journals.get(scope) ?? journals.set(scope, new FileKVStore(join(dir, 'journal', scope))).get(scope),
      initialMode: 'offline' } } : {}),
  });
  const stopNode = node.stop.bind(node);
  node.stop = async () => {
    await stopNode();
    await Promise.allSettled([...built.map(st => st.close?.()), ...[...journals.values()].map(j => j.close?.())]);
  };
  await node.start();
  const genesis = await runOwnerGenesis(node, { keyStore, label: tag });
  if (genesis !== 'enrolled') throw new Error(`${tag}: genesis ${genesis}`);
  return node;
}



/** Every connection of a party (control node and strand nodes), by kind. */
function connections(node) {
  const parts = [];
  const nodes = [['control', node.getControlNode()], ...[...node.getStrands().values()].map(s => ['strand', s.libp2pNode])];
  for (const [label, n] of nodes) {
    const kinds = { webrtc: 0, relayed: 0, other: 0 };
    for (const c of n?.getConnections?.() ?? []) {
      const a = c.remoteAddr.toString();
      // `/webrtc` first: a WebRTC connection signalled through a relay carries `/p2p-circuit` too.
      if (a.includes('/webrtc')) kinds.webrtc++; else if (a.includes('/p2p-circuit')) kinds.relayed++; else kinds.other++;
    }
    const listening = (n?.getMultiaddrs?.() ?? []).some(m => m.toString().includes('/webrtc'));
    parts.push(`${label}[webrtc ${kinds.webrtc} relayed ${kinds.relayed} other ${kinds.other}${listening ? ' +/webrtc' : ''}]`);
  }
  return parts.join(' ');
}

log(`mode: ${WEBRTC ? `webRTC() ${LISTEN_WEBRTC ? '+ listening on /webrtc' : 'without /webrtc listening'}` : 'relay only'}${ICE_FAIL ? ' [ICE cannot connect]' : ''}${OFFLINE ? ' [offline]' : ''}`);
const A = await party('a', `a-${randomUUID()}`, relayAddr);
const B = await party('b', `b-${randomUUID()}`, relayAddr);
log(`A addrs: ${A.getMultiaddrs().map(m => m.toString().replace(/\/p2p\/[^/]+/g, '/p2p/…')).join('  ')}`);

const strandId = `strand-${randomUUID()}`;
let t = Date.now();
const founded = await A.foundStrand({ strandId, type: 'c', memberPrivateKey: await generateStrandMemberKey(), sAppConfig: sApp });
const aDb = founded.instance.database.getDatabase();
const invitation = await A.createOpenInvitation(SAPP_ID, 3_600_000);
await A.publishFormationInvite(invitation.token, SAPP_ID, { strandId, expiresAtMs: Date.now() + 3_600_000, totalUses: 1 });
log(`A founded and invited in ${Date.now() - t} ms`);
t = Date.now();
try {
  const formed = await Promise.race([
    B.formStrand(B.decodeInvitation(A.encodeInvitation(invitation)), { metadata: { name: 'B' } }),
    new Promise((_, rej) => setTimeout(() => rej(new Error('formStrand did not finish within 120 s')), 120_000)),
  ]);
  log(`B formed (joined) in ${Date.now() - t} ms`);
  t = Date.now();
  await B.addStrand({ strandRow: { Id: formed.strandId, MemberPrivateKey: formed.memberPrivateKey ?? null, Type: 'c', FounderOwnerKey: null, FounderPeerId: null },
    sAppConfig: sApp, awaitFirstSync: false });
  const bInst = await B.whenStrandWritable(formed.strandId, { timeoutMs: 300_000 });
  log(`B's strand writable in ${Date.now() - t} ms`);
  let bDb = bInst.database.getDatabase();
  await new Promise(r => setTimeout(r, 5000));
  log(`connections  A: ${connections(A)}  |  B: ${connections(B)}`);

  /** One write `from` → `to`, each step bounded so a stall reads as a timeout, not a hang. */
  const within = (ms, what, p) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`${what}: not within ${ms / 1000} s`)), ms))]);
  async function write(from, db, to, toDb, size) {
    const bytes = new Uint8Array(randomBytes(size));
    const id = createHash('sha256').update(bytes).digest('hex');
    const label = `${size >= 1e6 ? `${size / (1024 * 1024)} MB` : `${size / 1024} KB`} ${from} → ${to}`;
    const t0 = Date.now();
    try {
      await within(180_000, 'commit', db.exec('insert into App.Note (Id, Bytes) values (?, ?)', [id, bytes]));
      const commit = Date.now() - t0;
      await within(180_000, 'readable', (async () => {
        for (;;) {
          let seen = false;
          for await (const r of toDb.eval('select length(Bytes) as N from App.Note where Id = ?', [id])) seen = Number(r.N) === bytes.length;
          if (seen) return;
          await new Promise(r => setTimeout(r, 200));
        }
      })());
      log(`${label}: commit ${commit} ms, readable at ${to} after ${Date.now() - t0} ms`);
    } catch (err) {
      log(`${label}: FAILED after ${Date.now() - t0} ms: ${err?.message}`);
    }
  }

  if (HIBERNATE) {
    await write('B', bDb, 'A', aDb, 10 * 1024);
    await write('A', aDb, 'B', bDb, 10 * 1024);
    t = Date.now();
    await B.hibernateStrand(formed.strandId);
    log(`B's strand hibernated in ${Date.now() - t} ms; down for 10 s`);
    await new Promise(r => setTimeout(r, 10_000));
    t = Date.now();
    await B.wakeStrand(formed.strandId);
    log(`B's strand woke in ${Date.now() - t} ms`);
    bDb = B.getStrands().get(formed.strandId).database.getDatabase();
    log(`connections  A: ${connections(A)}  |  B: ${connections(B)}`);
    await write('B', bDb, 'A', aDb, 10 * 1024);
    await write('A', aDb, 'B', bDb, 10 * 1024);
  } else {
    await write('B', bDb, 'A', aDb, 1024 * 1024);
    await write('A', aDb, 'B', bDb, 1024 * 1024);
  }
  log(`connections  A: ${connections(A)}  |  B: ${connections(B)}`);
} catch (err) {
  log(`FAIL after ${Date.now() - t} ms: ${err?.name}: ${String(err?.message).split('\n')[0].slice(0, 300)}`);
  log(`connections  A: ${connections(A)}  |  B: ${connections(B)}`);
}
await Promise.allSettled([A.stop(), B.stop(), relay.stop()]);
process.exit(0);
