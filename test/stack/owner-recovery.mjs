/**
 * Can a cadre be recovered with an OFFLINE BACKUP OWNER KEY after its owner phone is lost?
 *
 * The idea (classic lost-phone recovery): create a key, make it an owner of the cadre,
 * keep it offline in a vault. When the phone is lost, bring the key out, use it to remove
 * the lost phone and its owner key, and admit a new phone as an owner. Then put the key
 * back in the vault.
 *
 * In cadre-core v1.14 an owner key IS a node identity key (`getIdentityOwnerKey`), so
 * "using the key" means starting a temporary node whose identity is the backup key. This
 * script runs the whole story with real nodes in one process, loopback WebSockets, memory
 * storage (topology is not the question; trust and authorization are):
 *
 *   A  the phone: founding owner
 *   D  an always-on node, keyless (added by A with a seed, as `cadre enroll add` does)
 *   K  the backup key: generated here, never run until recovery; A makes it an owner
 *   -- A is lost (stopped, its key discarded) --
 *   R  the recovery node: identity = K, dials D
 *   P  the new phone: admitted by R with an owner-granting cadre invitation
 *   T  a node P then authorizes, to show P really is an owner in D's eyes
 *
 * Each step prints PASS or FAIL with what was observed; the first FAIL stops the run
 * (exit 1) and is the finding. Exit 0 = recovery works as described.
 *
 *   node owner-recovery.mjs
 *   STEP_TIMEOUT_MS=120000 node owner-recovery.mjs
 *   DEBUG=sereus:cadre:* node owner-recovery.mjs
 */
import { CadreNode, PersistentTrustedOwnerStore, ed25519KeyPairFromLibp2p } from '@serfab/cadre-core';
import { MemoryRawStorage } from '@optimystic/db-p2p';
import { webSockets } from '@libp2p/websockets';
import { generateKeyPair } from '@libp2p/crypto/keys';
import { peerIdFromPrivateKey } from '@libp2p/peer-id';
import { randomUUID } from 'node:crypto';

const STEP_TIMEOUT_MS = Number(process.env.STEP_TIMEOUT_MS ?? 60_000);
const LISTEN = '/ip4/127.0.0.1/tcp/0/ws';
const partyId = `recovery-${randomUUID()}`;
const t0 = Date.now();
const secs = () => ((Date.now() - t0) / 1000).toFixed(1).padStart(6);
const nodes = [];

function log(text) { console.log(`${secs()}s  ${text}`); }

async function until(what, check, ms = STEP_TIMEOUT_MS) {
  const deadline = Date.now() + ms;
  let last;
  while (Date.now() < deadline) {
    try { last = await check(); if (last) return last; } catch (err) { last = err; }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(`timed out waiting for ${what}${last instanceof Error ? ` (last error: ${last.message})` : ''}`);
}

async function step(name, fn) {
  try {
    const detail = await fn();
    log(`PASS  ${name}${detail ? ` — ${detail}` : ''}`);
  } catch (err) {
    log(`FAIL  ${name} — ${err instanceof Error ? err.message : String(err)}`);
    await dumpState();
    await shutdown(1);
  }
}

/** A memory-backed anchor, so the script can read what each node trusts. */
async function memoryAnchor() {
  let text;
  const slot = { async load() { return text; }, async save(t) { text = t; } };
  return PersistentTrustedOwnerStore.open(slot, partyId);
}

async function startNode(label, privateKey, { bootstrap = [], pinnedKeys = [], profile = 'transaction' } = {}) {
  const scopes = new Map();
  const node = new CadreNode({
    privateKey,
    controlNetwork: { partyId, bootstrapNodes: bootstrap },
    profile,
    strandFilter: { mode: 'none' },
    hostUnclaimedStrands: false,
    storage: { provider: scope => scopes.get(scope) ?? scopes.set(scope, new MemoryRawStorage()).get(scope) },
    network: {
      transports: [webSockets()],
      listenAddrs: [LISTEN],
      connectionGater: { denyDialMultiaddr: () => false },
    },
    trustedOwners: { store: await memoryAnchor(), pinnedKeys },
    requireSignedSchemas: false,
  });
  await node.start();
  nodes.push(node);
  labels.set(label, node);
  const addrs = node.getControlNode().getMultiaddrs().map(a => a.toString());
  log(`      ${label} up: ${node.peerId.toString().slice(-8)}`);
  return { node, addrs, owner: ed25519KeyPairFromLibp2p(privateKey), peerId: node.peerId.toString() };
}

const ownerKeys = async n => [...(await n.getControlDatabase().getOwnerKeys())];
const anchored = n => [...n.getTrustedOwnerStore().all()];
const authorized = async n => (await n.listAuthorizedMembers()).map(m => m.peerId);
const short = k => k.slice(0, 8);

/** What every running node sees, for a failure report. */
async function dumpState() {
  for (const [label, n] of labels) {
    if (!nodes.includes(n)) continue;
    const db = n.getControlDatabase();
    const listed = await n.listMembers(false).catch(e => `error: ${e.message}`);
    const auth = await n.listAuthorizedMembers(false).catch(e => `error: ${e.message}`);
    const conns = n.getControlNode()?.getConnections().map(c => `${c.remotePeer.toString().slice(-8)}/${c.direction}`) ?? [];
    console.log(`        ${label} ${n.peerId.toString().slice(-8)}: owners=${JSON.stringify([...(await db.getOwnerKeys(false))].map(short))}`
      + ` anchor=${JSON.stringify(anchored(n).map(short))}`
      + ` members=${JSON.stringify(Array.isArray(listed) ? listed.map(m => m.peerId.slice(-8)) : listed)}`
      + ` authorized=${JSON.stringify(Array.isArray(auth) ? auth.map(m => m.peerId.slice(-8)) : auth)}`
      + ` connections=${JSON.stringify(conns)}`);
  }
}
const labels = new Map();

async function shutdown(code) {
  for (const n of nodes.reverse()) await n.stop().catch(() => {});
  log(code === 0 ? 'RESULT: recovery with an offline backup owner key WORKS' : 'RESULT: recovery FAILED at the step above');
  process.exit(code);
}

// ── The cadre before the loss ───────────────────────────────────────────────

let A, D, K, R, P, T;

await step('A (the phone) founds the cadre and is its owner', async () => {
  A = await startNode('A', await generateKeyPair('Ed25519'));
  await A.node.getControlDatabase().ensureOwnerKey(A.owner.publicKeyB64);
  await A.node.initializeSeedBootstrap(A.owner.privateKeyB64);
  await A.node.registerSelf();
  const keys = await ownerKeys(A.node);
  if (!keys.includes(A.owner.publicKeyB64)) throw new Error(`owner keys: ${keys.map(short)}`);
  return `owner ${short(A.owner.publicKeyB64)}`;
});

/** The owner-online admission sereus's own harness uses (`admitMember`): vouch, deliver the seed, reconcile. */
async function admit(owner, member) {
  const { seed } = await owner.node.addDrone({ dronePeerId: member.peerId, droneMultiaddrs: member.addrs });
  const delivered = await owner.node.deliverSeed(member.addrs[0], seed);
  if (!delivered.accepted) throw new Error(`the member refused the seed: ${delivered.reason ?? 'no reason'}`);
  await owner.node.reconcileControlCohort();
}

await step('D (always-on, keyless) is admitted by A, trusting A', async () => {
  D = await startNode('D', await generateKeyPair('Ed25519'), { pinnedKeys: [A.owner.publicKeyB64], profile: 'storage' });
  await D.node.enableSeedListener();
  await admit(A, D);
  // (`listAuthorizedMembers` lists the OTHER members: a node does not list itself.)
  await until('D to hold A\'s owner key and list A as a member', async () =>
    (await ownerKeys(D.node)).includes(A.owner.publicKeyB64) && (await authorized(D.node)).includes(A.peerId));
  return `D authorized members: ${(await authorized(D.node)).map(p => p.slice(-8))}`;
});

// The backup key: an ed25519 key made here and never run as a node until recovery.
const backupKey = await generateKeyPair('Ed25519');
K = { owner: ed25519KeyPairFromLibp2p(backupKey), peerId: peerIdFromPrivateKey(backupKey).toString() };

await step('A makes the backup key K an owner, and vouches for K\'s node identity (it never runs)', async () => {
  const added = await A.node.addOwner(K.owner.publicKeyB64);
  if (!added) throw new Error('addOwner returned false');
  // An owner key alone is not a cadre member: the control network admits member nodes.
  // So the backup is also vouched as a node (no addresses: it is offline).
  await A.node.authorizePeer(K.peerId);
  return `K = ${short(K.owner.publicKeyB64)}`;
});

await step('D comes to trust K through A\'s signature (anchor chain), and lists K\'s node', async () => {
  await until('K in D\'s owner table and anchor, K\'s node a member', async () =>
    (await ownerKeys(D.node)).includes(K.owner.publicKeyB64) && anchored(D.node).includes(K.owner.publicKeyB64)
    && (await authorized(D.node)).includes(K.peerId));
  return `D anchors: ${anchored(D.node).map(short)}`;
});

// What goes in the vault: the key, the cadre's party id, its owner keys (public), and an
// address of an always-on member to reach it through.
const kit = { partyId, key: backupKey, ownerKeys: await ownerKeys(A.node), reach: D.addrs };

// ── The phone is lost ───────────────────────────────────────────────────────

await step('A is lost (stopped; its key is gone)', async () => {
  await A.node.stop();
  nodes.splice(nodes.indexOf(A.node), 1);
});

// ── Recovery with the vault key ─────────────────────────────────────────────

await step('R starts with identity = K and reaches the cadre through D', async () => {
  R = await startNode('R', kit.key, { bootstrap: kit.reach, pinnedKeys: kit.ownerKeys });
  if (R.peerId !== K.peerId) throw new Error('R is not running as K');
  await until('R to sync the owner table from D', async () => {
    const keys = await ownerKeys(R.node);
    return keys.includes(A.owner.publicKeyB64) && keys.includes(K.owner.publicKeyB64);
  });
  return `R sees owners ${(await ownerKeys(R.node)).map(short)}`;
});

await step('R takes up K as its signing owner key (no genesis: the table is not empty)', async () => {
  await R.node.initializeSeedBootstrap(K.owner.privateKeyB64);
  return `R anchors: ${anchored(R.node).map(short)}`;
});

await step('R removes the lost phone A as a node', async () => {
  await R.node.removePeer(A.peerId);
  await until('A gone from D\'s members', async () => !(await authorized(D.node)).includes(A.peerId));
});

await step('R removes A\'s owner key', async () => {
  const removed = await R.node.removeOwner(A.owner.publicKeyB64);
  if (!removed) throw new Error('removeOwner returned false');
  await until('A\'s key gone from D\'s owners and anchor', async () =>
    !(await ownerKeys(D.node)).includes(A.owner.publicKeyB64) && !anchored(D.node).includes(A.owner.publicKeyB64));
  return `D owners now ${(await ownerKeys(D.node)).map(short)}`;
});

await step('R admits the new phone P as an owner (owner-granting invitation, redeemed at D)', async () => {
  const pKey = await generateKeyPair('Ed25519');
  const pPeer = peerIdFromPrivateKey(pKey).toString();
  const { invitation } = await R.node.createCadreInvitation({ peerId: pPeer, grantsOwner: true });
  P = await startNode('P', pKey, { bootstrap: D.addrs });
  await until('P to redeem the invitation', async () => {
    try { await P.node.redeemCadreInvitation(invitation); return true; }
    catch (err) { if (err?.name === 'CadreInviteUnreachableError') return false; throw err; }
  });
  await until('P\'s key in D\'s owners and anchor', async () =>
    (await ownerKeys(D.node)).includes(P.owner.publicKeyB64) && anchored(D.node).includes(P.owner.publicKeyB64));
  return `P = ${short(P.owner.publicKeyB64)}`;
});

await step('The vault key goes back offline (R stopped)', async () => {
  await R.node.stop();
  nodes.splice(nodes.indexOf(R.node), 1);
});

await step('P acts as an owner on its own: it authorizes a new node T, and D accepts it', async () => {
  await until('P to hold the owner table with itself in it', async () =>
    (await ownerKeys(P.node)).includes(P.owner.publicKeyB64));
  await P.node.initializeSeedBootstrap(P.owner.privateKeyB64);
  T = await startNode('T', await generateKeyPair('Ed25519'), { pinnedKeys: [P.owner.publicKeyB64], profile: 'storage' });
  await T.node.enableSeedListener();
  await admit(P, T);
  await until('D to authorize T', async () => (await authorized(D.node)).includes(T.peerId));
  return `D authorized members: ${(await authorized(D.node)).map(p => p.slice(-8))}`;
});

await shutdown(0);
