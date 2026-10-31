/**
 * Does a block replicated to this machine survive a restart soon after it arrived, while
 * the member that wrote it is offline?
 *
 * Two parties on loopback, file storage. A founds a closed strand, B joins, each writes one
 * row, and A reads both. B stops for good. A waits `SETTLE_S` seconds (default 3), reads
 * again, stops and restarts, then reads.
 *
 * Result (2026-10-30, sereus 1.19.1 / optimystic 1.20.1): B's row survives only if A's
 * stores are closed after `stop()`. Optimystic groups writes in memory and flushes them on
 * a timer, and the code that builds a store must close it. With `CLOSE=0` (stores left
 * open) A lost B's row in 12 of 14 runs at a 3 s settle (both modes), and kept it at 15 s or more.
 * Not a stack bug: an embedder's duty, which serchat's host had missed.
 *
 *   node test/stack/restart-after-replicated-write.mjs              # stores closed: both rows
 *   CLOSE=0 node test/stack/restart-after-replicated-write.mjs      # stores left open: B's row lost
 *   OFFLINE=1 …                                                     # with strand offline mode
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { webSockets } from '@libp2p/websockets';
import { CadreNode, DEFAULT_IDENTITY_KEY_ID, generateStrandMemberKey } from '@serfab/cadre-core';
import { FileKeyStore } from '@serfab/cadre-core/key-store-file';
import { runOwnerGenesis } from '@serfab/cadre-core/edge-node';
import { FileTrustedOwnerStore } from '@serfab/cadre-core/trusted-owner-store-file';
import { FileBootstrapPeerStore } from '@serfab/cadre-core/bootstrap-peer-store-file';
import { FileEnrolledMachineStore } from '@serfab/cadre-core/enrolled-machine-store-file';
import { FileStrandNetworkStateStore } from '@serfab/cadre-core/strand-network-state-file';
import { FileKVStore, FileRawStorage } from '@optimystic/db-p2p-storage-fs';

const OFFLINE = process.env.OFFLINE === '1';
const SAPP_ID = 'org.example.offline-restart';
const SAPP = {
  id: SAPP_ID, version: '1.0.0', signature: '', latencyHint: 'interactive',
  schema: 'table Message (Id text primary key, Content text not null) with tags ("optimystic.network_watch" = true);',
};

const root = mkdtempSync(join(tmpdir(), 'offline-restart-'));
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);

async function party(tag, partyId) {
  const dir = join(root, tag);
  const keyStore = new FileKeyStore(join(dir, 'keys'));
  const journals = new Map();
  const built = [];
  const node = new CadreNode({
    keyStore, identityKeyId: DEFAULT_IDENTITY_KEY_ID,
    controlNetwork: { partyId, bootstrapNodes: [] },
    profile: 'transaction',
    // The embedder that builds a storage closes it (Optimystic IRawStorage.close); CLOSE=0 skips it.
    storage: { provider: scope => { const st = new FileRawStorage(join(dir, 'blocks', scope)); built.push(st); return st; } },
    network: { transports: [webSockets()], listenAddrs: ['/ip4/127.0.0.1/tcp/0/ws'], relayAddrs: [], requireRelay: false,
      connectionGater: { denyDialMultiaddr: () => false } },
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
  const stopAndClose = node.stop.bind(node);
  node.stop = async () => {
    await stopAndClose();
    if (process.env.CLOSE !== '0') {
      await Promise.allSettled(built.map(st => st.close?.()));
      await Promise.allSettled([...journals.values()].map(j => j.close?.()));
    }
  };
  await node.start();
  const genesis = await runOwnerGenesis(node, { keyStore, label: tag });
  if (genesis !== 'enrolled') throw new Error(`${tag}: genesis ${genesis}`);
  return node;
}

const aParty = `a-${randomUUID()}`;
let A = await party('a', aParty);
const B = await party('b', `b-${randomUUID()}`);

const strandId = `strand-${randomUUID()}`;
const founded = await A.foundStrand({ strandId, type: 'c', memberPrivateKey: await generateStrandMemberKey(), sAppConfig: SAPP });
await founded.instance.database.getDatabase().exec(`insert into App.Message (Id, Content) values ('a1', 'from a')`);
const invitation = await A.createOpenInvitation(SAPP_ID, 3_600_000);
await A.publishFormationInvite(invitation.token, SAPP_ID, { strandId, expiresAtMs: Date.now() + 3_600_000, totalUses: 1 });
const formed = await B.formStrand(B.decodeInvitation(A.encodeInvitation(invitation)), { metadata: { name: 'B' } });
await B.addStrand({ strandRow: { Id: formed.strandId, MemberPrivateKey: formed.memberPrivateKey ?? null, Type: 'c', FounderOwnerKey: null, FounderPeerId: null },
  sAppConfig: SAPP, awaitFirstSync: false });
const bInst = await B.whenStrandWritable(formed.strandId, { timeoutMs: 300_000 });
await bInst.database.getDatabase().exec(`insert into App.Message (Id, Content) values ('b1', 'from b')`);
for (;;) {
  let n = 0;
  for await (const _ of founded.instance.database.getDatabase().eval('select Id from App.Message')) n++;
  if (n >= 2) break;
  await new Promise(r => setTimeout(r, 200));
}
log(`A reads both rows; B stops for good [${OFFLINE ? 'offline mode' : 'online'}]`);
await B.stop();
{
  await new Promise(r => setTimeout(r, Number(process.env.SETTLE_S ?? 3) * 1000));
  const ids = [];
  try { for await (const r of founded.instance.database.getDatabase().eval('select Id from App.Message')) ids.push(r.Id); } catch (e) { log('read failed:', e.message); }
  log(`B stopped; A, before its restart, reads: ${ids.join(', ')}`);
}
await A.stop();

A = await party('a', aParty);
const outcome = await new Promise(resolve => {
  const timer = setTimeout(() => resolve({ ok: false, error: 'strand not discovered within 120 s' }), 120_000);
  A.on('strand:discovered', async ({ strandId: id, strand }) => {
    if (id !== strandId) return;
    clearTimeout(timer);
    const t = Date.now();
    try {
      await A.addStrand({ strandRow: strand, sAppConfig: SAPP, awaitFirstSync: false });
      resolve({ ok: true, ms: Date.now() - t });
    } catch (err) {
      resolve({ ok: false, ms: Date.now() - t, error: `${err?.name}: ${err?.message}` });
    }
  });
});
log(outcome.ok ? `addStrand OK in ${outcome.ms} ms` : `addStrand FAILED after ${outcome.ms ?? '?'} ms: ${outcome.error}`);
if (outcome.ok) {
  const db = A.getStrands().get(strandId)?.database;
  let rows = 0;
  const ids = [];
  try { for await (const r of db.getDatabase().eval('select Id from App.Message')) { rows++; ids.push(r.Id); } } catch (e) { log('read failed:', e.message); }
  log(`A, after its restart, reads: ${ids.join(', ')}`);
  for (const wait of [5, 30]) {
    await new Promise(r => setTimeout(r, wait * 1000));
    const again = [];
    try { for await (const r of db.getDatabase().eval('select Id from App.Message')) again.push(r.Id); } catch (e) { log('read failed:', e.message); }
    log(`… ${wait} s later: ${again.join(', ')}`);
  }
}
await A.stop();
process.exit(0);
