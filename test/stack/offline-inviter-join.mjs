/**
 * offline-inviter-join.mjs — does a join attempted while the inviter is offline
 * ever complete, without anyone trying again by hand?
 *
 * THE CASE. Two phones, no other machines. The inviter makes an invitation and
 * closes the app. The invitee opens it and taps Join while the inviter is down,
 * then closes theirs. Later both are online at once. Today nothing happens: the
 * join was a single live handshake, it failed, and nothing on the invitee's side
 * remembers it was ever attempted.
 *
 * WHAT THIS SCRIPT DOES, with only public cadre-core calls, both parties in one
 * Node process, relay-only as phones are, storage persisted across restarts:
 *
 *   1. HOST founds a closed strand, publishes an invitation, then STOPS.
 *   2. JOINER calls formStrand while the host is down -> expected to fail.
 *      Then: what does the joiner's party know about the attempt? (Today: nothing.)
 *   3. (JOINER_RESTART=1) the joiner restarts too, while the host is still down,
 *      as the invitee closing their app.
 *   4. HOST restarts over the same storage and identity, and is reachable again.
 *   5. WAIT_MS with nobody calling anything on the joiner.
 *        PASS -> the joiner joined on its own (the strand is discovered/attached).
 *        FAIL -> it did not. Then one manual formStrand call shows the invitation
 *                was still good the whole time: the missing piece is a durable,
 *                retried pending join on the invitee's side, nothing else.
 *
 * Exit 0 = joined on its own (the behaviour asked for). Exit 1 = did not (today).
 * Exit 2/3 = the rig itself failed (no relay, no reservation, unexpected error).
 *
 *   RELAY_ADDR=/dns4/relay.sereus.org/tcp/4011/ws/p2p/12D3Koo… node offline-inviter-join.mjs
 *   JOINER_RESTART=1 WAIT_MS=180000 RELAY_ADDR=… node offline-inviter-join.mjs
 */
import { CadreNode, ControlFormationUsageRecorder, generateStrandMemberKey, KeyStoreJoinedStrandStore } from '@serfab/cadre-core';
import { LevelDBRawStorage } from '@optimystic/db-p2p-storage-rn';
import { webSockets } from '@libp2p/websockets';
import { circuitRelayTransport } from '@libp2p/circuit-relay-v2';
import { generateKeyPair, privateKeyToProtobuf, privateKeyFromProtobuf } from '@libp2p/crypto/keys';
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { FileBootstrapPeerStore } from '@serfab/cadre-core/bootstrap-peer-store-file';
import { FileStrandNetworkStateStore } from '@serfab/cadre-core/strand-network-state-file';
import { FileKeyStore } from '@serfab/cadre-core/key-store-file';
import { openTestDb } from './classic-level-driver.mjs';

const RELAY_ADDR = process.env.RELAY_ADDR;
if (!RELAY_ADDR) {
  console.error('RELAY_ADDR is required — relay-only, as phones are.');
  process.exit(2);
}
const STORE_ROOT = process.env.STORE_ROOT ?? join(tmpdir(), 'offline-inviter-join');
const WAIT_MS = Number(process.env.WAIT_MS ?? 120_000);
const REACHABLE_MS = Number(process.env.REACHABLE_MS ?? 60_000);
const JOINER_RESTART = process.env.JOINER_RESTART === '1';
/**
 * JOIN_MODE=form (default) — the one-shot `formStrand`, which the original report was about.
 * JOIN_MODE=request — sereus 1.10's `requestJoin`, which records a party-wide pending join and
 * keeps trying (gotchoices/sereus#25). The PASS condition is the same: the joiner ends up
 * joined with nobody calling anything after the host comes back.
 */
const JOIN_MODE = process.env.JOIN_MODE ?? 'form';

const SAPP = {
  id: 'org.sereus.repro.offlinejoin',
  version: '0.1.0',
  schema: `table Member (
    Id text primary key,
    Name text not null
);`,
  signature: '',
  latencyHint: 'interactive',
};

const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);

if (existsSync(STORE_ROOT)) rmSync(STORE_ROOT, { recursive: true, force: true });
mkdirSync(STORE_ROOT, { recursive: true });

// A machine keeps its peer id across a restart; so does this rig.
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

/** Every strand the node is offered, attached as an app would (cadre-core only emits). */
const discovered = new Map();   // tag -> Set(strandId)
function autoAttach(node, tag) {
  const attaching = new Set();
  node.on('strand:discovered', ({ strandId, strand }) => {
    if (!discovered.has(tag)) discovered.set(tag, new Set());
    discovered.get(tag).add(strandId);
    if (attaching.has(strandId) || node.getStrands().has(strandId)) return;
    attaching.add(strandId);
    void node.addStrand({ strandRow: strand, sAppConfig: SAPP })
      .then(() => log(`${tag}: attached discovered strand ${strandId}`))
      .catch(e => log(`${tag}: attach of ${strandId} failed — ${e?.message ?? e}`))
      .finally(() => attaching.delete(strandId));
  });
}

async function startParty(tag, partyId) {
  // Durable stores, as every real embedder injects (sereus 1.7 notes: "either store
  // left in memory reproduces the old behaviour").
  const node = new CadreNode({
    privateKey: await identityFor(tag),
    controlNetwork: { partyId, bootstrapNodes: [] },
    bootstrapPeers: { store: await FileBootstrapPeerStore.open(join(STORE_ROOT, `${tag}-bootstrap`), partyId) },
    strandNetworkState: { store: await FileStrandNetworkStateStore.open(join(STORE_ROOT, `${tag}-strandnet`), partyId) },
    joinedStrands: { store: new KeyStoreJoinedStrandStore(new FileKeyStore(join(STORE_ROOT, `${tag}-keys`)), partyId) },
    profile: 'transaction',
    strandFilter: { mode: 'all' },
    storage: { provider: storageFor(tag) },
    network: {
      transports: [webSockets(), circuitRelayTransport()],
      listenAddrs: [],
      relayAddrs: [RELAY_ADDR],
      requireRelay: false,
    },
    hibernation: { enabled: false },
    requireSignedSchemas: false,
  });
  autoAttach(node, tag);
  await node.start();
  const owner = node.getIdentityOwnerKey();
  await node.getControlDatabase().ensureOwnerKey(owner.publicKeyB64);
  node.initializeSeedBootstrap(owner.privateKeyB64);
  // The formation responder, installed at every start as an app does at boot.
  node.initializeStrandSolicitation({
    formationUsageRecorder: new ControlFormationUsageRecorder(node.getControlDatabase()),
  });
  return node;
}

async function awaitReachable(node, tag) {
  const until = Date.now() + REACHABLE_MS;
  while (Date.now() < until) {
    if (node.getMultiaddrs().length > 0) { log(`${tag}: reachable`); return true; }
    await new Promise(r => setTimeout(r, 500));
  }
  log(`${tag}: no relay reservation after ${REACHABLE_MS / 1000}s`);
  return false;
}

/** Everything the joiner's own party records that could stand for "I am joining X". */
async function joinerKnowledge(node, strandId) {
  const control = node.getControlDatabase();
  const joinedRows = await control.queryJoinedStrands().catch(() => []);
  return {
    attached: node.getStrands().has(strandId),
    joinedStrandRecord: joinedRows.some(r => r.Id === strandId),
    discovered: discovered.get('joiner')?.has(strandId) ?? false,
  };
}
const joined = k => k.attached || k.joinedStrandRecord || k.discovered;

const partyHost = `offline-host-${randomUUID().slice(0, 8)}`;
const partyJoiner = `offline-joiner-${randomUUID().slice(0, 8)}`;
let host, joiner;
let code = 2;
try {
  // 1. Host: found, invite, go away.
  host = await startParty('host', partyHost);
  if (!await awaitReachable(host, 'HOST')) process.exit(3);
  joiner = await startParty('joiner', partyJoiner);
  if (!await awaitReachable(joiner, 'JOINER')) process.exit(3);

  const strandId = randomUUID();
  await host.foundStrand({ strandId, type: 'c', memberPrivateKey: await generateStrandMemberKey(), sAppConfig: SAPP });
  const invitation = await host.createOpenInvitation(SAPP.id, 60 * 60 * 1000);
  await host.publishFormationInvite(invitation.token, SAPP.id, { expiresAtMs: invitation.expiration.getTime(), strandId });
  log(`HOST: founded ${strandId} and published an invitation (expires in 1 h)`);
  await host.stop(); host = null; await closeDbsFor('host');
  log('HOST: stopped (the inviter closed the app)');
  // Let the relay notice the reservation is gone, as it would for a closed app.
  await new Promise(r => setTimeout(r, 5000));

  // 2. Joiner tries while the host is down.
  const disclosure = { partyId: partyJoiner, purpose: 'offline-inviter repro', metadata: { name: 'Joiner' } };
  const a0 = Date.now();
  if (JOIN_MODE === 'request') {
    joiner.on?.('pendingJoin:changed', (st) => log(`JOINER: pendingJoin:changed → ${st?.state ?? JSON.stringify(st)}`));
    const st = await joiner.requestJoin(invitation, disclosure);
    log(`JOINER: requestJoin returned after ${((Date.now() - a0) / 1000).toFixed(1)}s — ${JSON.stringify(st)}`);
    if (st?.state === 'joined') { log('JOINER: !! joined with the host down — the rig is wrong'); process.exit(2); }
  } else {
    try {
      await joiner.formStrand(invitation, disclosure);
      log('JOINER: !! formStrand SUCCEEDED with the host down — the rig is wrong (is the host really stopped?)');
      process.exit(2);
    } catch (e) {
      log(`JOINER: formStrand failed after ${((Date.now() - a0) / 1000).toFixed(1)}s, as expected — ${e?.name}: ${e?.message}`);
    }
  }
  log('JOINER: what its own party records about that attempt:', JSON.stringify(await joinerKnowledge(joiner, strandId)));

  // 3. Optionally the invitee closes the app too.
  if (JOINER_RESTART) {
    await joiner.stop(); await closeDbsFor('joiner');
    joiner = await startParty('joiner', partyJoiner);
    if (!await awaitReachable(joiner, 'JOINER')) process.exit(3);
    log('JOINER: restarted while the host was still down (the invitee closed the app)');
  }

  // 4. Host comes back.
  host = await startParty('host', partyHost);
  if (!await awaitReachable(host, 'HOST')) process.exit(3);
  const backAt = Date.now();
  log('HOST: back online, same identity and storage. From here nobody calls anything on the joiner.');

  // 5. Does the joiner finish on its own?
  let k = await joinerKnowledge(joiner, strandId);
  while (!joined(k) && Date.now() - backAt < WAIT_MS) {
    await new Promise(r => setTimeout(r, 5000));
    k = await joinerKnowledge(joiner, strandId);
  }
  if (joined(k)) {
    log(`PASS: the joiner joined on its own ${((Date.now() - backAt) / 1000).toFixed(0)}s after the host came back —`, JSON.stringify(k));
    code = 0;
  } else {
    log(`FAIL: ${WAIT_MS / 1000}s with both online and the joiner has not joined —`, JSON.stringify(k));
    // The control: the invitation was good all along; one manual call completes it.
    const m0 = Date.now();
    code = 1;
    try {
      const formed = await joiner.formStrand(invitation, disclosure);
      log(`CONTROL: a manual formStrand now succeeds in ${((Date.now() - m0) / 1000).toFixed(1)}s ` +
          `(bound to ${formed.strandId === strandId ? 'the host\'s strand' : formed.strandId}). ` +
          'The invitation was valid throughout; only a durable, retried pending join is missing.');
    } catch (e) {
      log(`CONTROL: manual formStrand ALSO failed — ${e?.name}: ${e?.message}. The FAIL above is not clean evidence.`);
      code = 2;
    }
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
