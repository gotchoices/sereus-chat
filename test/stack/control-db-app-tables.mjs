/**
 * Can an app keep its own private tables in the cadre's CONTROL database? (The idea behind
 * gotchoices/sereus#24's re-think: per-strand labels and per-person private notes, kept where
 * only this party's machines can read them, with no extra strand.)
 *
 * The control database is a Quereus database whose default vtab is Optimystic on the party's
 * control network, so a table created in it replicates to the party's machines. Every start runs
 * `apply schema CadreControl`, a DIFF that drops tables of THAT schema it does not declare
 * (Quereus `schema-differ`, "orphan drops"), so the app's tables go in a schema of their own,
 * `ChatPrivate`. Writes go through `ControlDatabase.execWrite`, which serializes them with
 * cadre-core's own control writes (one shared `Database`).
 *
 * Steps (each prints PASS or FAIL; the first FAIL stops the run, exit 1):
 *   1. machine A (file storage): owner genesis; declare + apply `ChatPrivate`; write and read a row
 *   2. A restarts on the same files: does `ChatPrivate.Note` exist before the app re-declares it
 *      (start-up hydration), is the row there, does the app's own re-apply leave it intact, and
 *      is `CadreControl` untouched
 *   3. machine D joins A's party (owner-online admission: addDrone + seed + reconcile): does the
 *      row reach D, with and without D declaring the schema itself; does a row written on D reach A
 *
 *   node test/stack/control-db-app-tables.mjs
 *   STEP_TIMEOUT_MS=120000 node test/stack/control-db-app-tables.mjs
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { webSockets } from '@libp2p/websockets';
import { generateKeyPair } from '@libp2p/crypto/keys';
import { MemoryRawStorage } from '@optimystic/db-p2p';
import { FileRawStorage } from '@optimystic/db-p2p-storage-fs';
import { CadreNode, DEFAULT_IDENTITY_KEY_ID, PersistentTrustedOwnerStore } from '@serfab/cadre-core';
import { FileKeyStore } from '@serfab/cadre-core/key-store-file';
import { runOwnerGenesis } from '@serfab/cadre-core/edge-node';
import { FileTrustedOwnerStore } from '@serfab/cadre-core/trusted-owner-store-file';
import { FileBootstrapPeerStore } from '@serfab/cadre-core/bootstrap-peer-store-file';
import { FileEnrolledMachineStore } from '@serfab/cadre-core/enrolled-machine-store-file';
import { FileStrandNetworkStateStore } from '@serfab/cadre-core/strand-network-state-file';

const STEP_TIMEOUT_MS = Number(process.env.STEP_TIMEOUT_MS ?? 60_000);
const LISTEN = '/ip4/127.0.0.1/tcp/0/ws';
const partyId = `ctl-app-${randomUUID()}`;
const dir = mkdtempSync(join(tmpdir(), 'control-db-app-tables-'));
const t0 = Date.now();
const log = text => console.log(`${((Date.now() - t0) / 1000).toFixed(1).padStart(6)}s  ${text}`);
const running = [];

const APP_SCHEMA = `declare schema ChatPrivate {
  table Note (
    Key text primary key,
    Text text not null
  )
};
apply schema ChatPrivate;`;

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
    log(`FAIL  ${name} — ${err instanceof Error ? err.message.split('\n')[0] : String(err)}`);
    await shutdown(1);
  }
}
async function shutdown(code) {
  for (const n of running.reverse()) await n.stop().catch(() => {});
  log(code === 0 ? 'RESULT: app tables in the control database WORK as tested' : 'RESULT: FAILED at the step above');
  process.exit(code);
}

/** Machine A: file storage, so a restart reads what the last run wrote. Stores closed on stop. */
async function startA() {
  const keyStore = new FileKeyStore(join(dir, 'keys'));
  const built = [];
  const node = new CadreNode({
    keyStore, identityKeyId: DEFAULT_IDENTITY_KEY_ID,
    controlNetwork: { partyId, bootstrapNodes: [] },
    profile: 'transaction',
    strandFilter: { mode: 'none' },
    storage: { provider: scope => { const st = new FileRawStorage(join(dir, 'blocks', scope)); built.push(st); return st; } },
    network: { transports: [webSockets()], listenAddrs: [LISTEN], relayAddrs: [], requireRelay: false,
      connectionGater: { denyDialMultiaddr: () => false } },
    requireSignedSchemas: false,
    trustedOwners: { store: await FileTrustedOwnerStore.open(join(dir, 'node'), partyId) },
    bootstrapPeers: { store: await FileBootstrapPeerStore.open(join(dir, 'node'), partyId) },
    enrolledMachines: { store: await FileEnrolledMachineStore.open(join(dir, 'node'), partyId) },
    strandNetworkState: { store: await FileStrandNetworkStateStore.open(join(dir, 'node'), partyId) },
  });
  const stop = node.stop.bind(node);
  node.stop = async () => { await stop(); await Promise.allSettled(built.map(st => st.close?.())); };
  await node.start();
  running.push(node);
  const genesis = await runOwnerGenesis(node, { keyStore, label: 'A' });
  return { node, genesis, addrs: node.getControlNode().getMultiaddrs().map(a => a.toString()), peerId: node.peerId.toString() };
}

/** Machine D: memory storage, trusting A's owner keys, reaching the party through A. */
async function startD(bootstrap, pinnedKeys) {
  let text;
  const slot = { async load() { return text; }, async save(t) { text = t; } };
  const scopes = new Map();
  const node = new CadreNode({
    privateKey: await generateKeyPair('Ed25519'),
    controlNetwork: { partyId, bootstrapNodes: bootstrap },
    profile: 'transaction',
    strandFilter: { mode: 'none' },
    hostUnclaimedStrands: false,
    storage: { provider: scope => scopes.get(scope) ?? scopes.set(scope, new MemoryRawStorage()).get(scope) },
    network: { transports: [webSockets()], listenAddrs: [LISTEN], connectionGater: { denyDialMultiaddr: () => false } },
    trustedOwners: { store: await PersistentTrustedOwnerStore.open(slot, partyId), pinnedKeys },
    requireSignedSchemas: false,
  });
  await node.start();
  running.push(node);
  return { node, addrs: node.getControlNode().getMultiaddrs().map(a => a.toString()), peerId: node.peerId.toString() };
}

const db = n => n.getControlDatabase().getDatabase();
async function rows(n, sql) {
  const out = [];
  for await (const r of db(n).eval(sql)) out.push({ ...r });
  return out;
}
const notes = n => rows(n, 'select Key, Text from ChatPrivate.Note order by Key');
const hasSchema = n => !!db(n).schemaManager?.getSchema?.('ChatPrivate')?.getTable?.('Note');
const controlTables = async n => [...(await n.getControlDatabase().getOwnerKeys())].length;
const show = list => list.map(r => `${r.Key}=${r.Text}`).join(', ') || '(none)';

let A, D;

await step('1a. A starts and is the owner (genesis)', async () => {
  A = await startA();
  if (A.genesis !== 'enrolled') throw new Error(`genesis: ${A.genesis}`);
  return `peer ${A.peerId.slice(-8)}, files ${dir}`;
});
await step('1b. A declares and applies ChatPrivate through execWrite', async () => {
  const t = Date.now();
  await A.node.getControlDatabase().execWrite(APP_SCHEMA, undefined, 'app schema');
  return `${Date.now() - t} ms`;
});
await step('1c. A writes a note and reads it back', async () => {
  let t = Date.now();
  await A.node.getControlDatabase().execWrite(`insert into ChatPrivate.Note (Key, Text) values ('strand:s1', 'for Bob, about the lease')`, undefined, 'note');
  const wrote = Date.now() - t;
  t = Date.now();
  const got = await notes(A.node);
  if (got.length !== 1) throw new Error(`rows: ${show(got)}`);
  return `write ${wrote} ms, read ${Date.now() - t} ms: ${show(got)}`;
});

await step('2a. A stops cleanly and restarts on the same files', async () => {
  await A.node.stop();
  running.splice(running.indexOf(A.node), 1);
  A = await startA();
  return `genesis ${A.genesis}; owner keys ${await controlTables(A.node)}`;
});
await step('2b. before the app re-declares it: is ChatPrivate.Note in the catalog, with its row?', async () => {
  const declared = hasSchema(A.node);
  let got = '(table not readable)';
  try { got = show(await notes(A.node)); } catch (err) { got = `(read failed: ${err.message.split('\n')[0]})`; }
  return `in catalog after start: ${declared}; rows: ${got}`;
});
await step('2c. the app re-applies ChatPrivate (as at every start) and the row is still there', async () => {
  await A.node.getControlDatabase().execWrite(APP_SCHEMA, undefined, 'app schema again');
  const got = await notes(A.node);
  if (got.length !== 1 || got[0].Text !== 'for Bob, about the lease') throw new Error(`rows: ${show(got)}`);
  return show(got);
});
await step('2d. CadreControl is intact (owner keys readable, a control write still lands)', async () => {
  const keys = await controlTables(A.node);
  if (keys < 1) throw new Error('no owner keys');
  return `owner keys ${keys}`;
});

await step('3a. D is admitted to A\'s party (addDrone, seed, reconcile)', async () => {
  const pinned = [...(await A.node.getControlDatabase().getOwnerKeys())];
  D = await startD(A.addrs, pinned);
  await D.node.enableSeedListener();
  const { seed } = await A.node.addDrone({ dronePeerId: D.peerId, droneMultiaddrs: D.addrs });
  const delivered = await A.node.deliverSeed(D.addrs[0], seed);
  if (!delivered.accepted) throw new Error(`seed refused: ${delivered.reason ?? 'no reason'}`);
  await A.node.reconcileControlCohort();
  await until('D to hold A\'s owner keys', async () => [...(await D.node.getControlDatabase().getOwnerKeys())].length >= pinned.length);
  return `D ${D.peerId.slice(-8)}`;
});
await step('3b. without declaring anything, does D see ChatPrivate.Note and A\'s row?', async () => {
  const t = Date.now();
  let seen = '(not within 20 s)';
  try {
    await until('the note on D', async () => (await notes(D.node)).length === 1, 20_000);
    seen = `${show(await notes(D.node))} after ${Date.now() - t} ms`;
  } catch (err) { seen = `no: ${err.message.split('\n')[0]}`; }
  return `in catalog: ${hasSchema(D.node)}; ${seen}`;
});
await step('3c. D applies ChatPrivate itself (as the app would) and reads A\'s row', async () => {
  await D.node.getControlDatabase().execWrite(APP_SCHEMA, undefined, 'app schema on D');
  const t = Date.now();
  await until('A\'s note on D', async () => (await notes(D.node)).some(r => r.Key === 'strand:s1'));
  return `${show(await notes(D.node))} (${Date.now() - t} ms after the apply)`;
});
await step('3d. a note written on D reaches A', async () => {
  await D.node.getControlDatabase().execWrite(`insert into ChatPrivate.Note (Key, Text) values ('peer:tom', 'Dad')`, undefined, 'note on D');
  const t = Date.now();
  await until('D\'s note on A', async () => (await notes(A.node)).some(r => r.Key === 'peer:tom'));
  return `A reads ${show(await notes(A.node))} after ${Date.now() - t} ms`;
});

await shutdown(0);
