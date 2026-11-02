/**
 * Does a strand still open after an app schema change while its other member is offline?
 *
 * Two parties on loopback, file storage. A founds a closed strand with schema v1, B joins and
 * writes, then B stops for good and A restarts with the strand's schema either unchanged
 * (`CHANGE=none`, the control) or with one column tag added (`CHANGE=tag`:
 * `Id text primary key with tags ("optimystic.fresh" = true)`, rows unchanged). Prints
 * whether A's `addStrand` of the discovered strand succeeds.
 *
 *   CHANGE=none node test/stack/schema-change-offline-peer.mjs
 *   CHANGE=tag  node test/stack/schema-change-offline-peer.mjs
 *   CHANGE=tag OFFLINE=1 node …     # with strand offline mode on (a file journal)
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

const CHANGE = process.env.CHANGE ?? 'tag';
const OFFLINE = process.env.OFFLINE === '1';
const SAPP_ID = 'org.example.schema-change';
const schema = tagged => `
  table Message (Id text primary key${tagged ? ' with tags ("optimystic.fresh" = true)' : ''}, Content text not null)
    with tags ("optimystic.network_watch" = true);
`;
const V1 = { id: SAPP_ID, version: '1.0.0', schema: schema(false), signature: '', latencyHint: 'interactive' };
const V2 = CHANGE === 'tag' ? { ...V1, version: '1.1.0', schema: schema(true) } : V1;

const root = mkdtempSync(join(tmpdir(), 'schema-change-'));
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
    // The embedder that builds a store closes it (Optimystic IRawStorage.close), below.
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

const aParty = `a-${randomUUID()}`;
let A = await party('a', aParty);
const bParty = `b-${randomUUID()}`;
const B = await party('b', bParty);

const strandId = `strand-${randomUUID()}`;
const founded = await A.foundStrand({ strandId, type: 'c', memberPrivateKey: await generateStrandMemberKey(), sAppConfig: V1 });
await founded.instance.database.getDatabase().exec(`insert into App.Message (Id, Content) values ('a1', 'from a')`);
const invitation = await A.createOpenInvitation(SAPP_ID, 3_600_000);
await A.publishFormationInvite(invitation.token, SAPP_ID, { strandId, expiresAtMs: Date.now() + 3_600_000, totalUses: 1 });
const formed = await B.formStrand(B.decodeInvitation(A.encodeInvitation(invitation)), { metadata: { name: 'B' } });
const bRow = { Id: formed.strandId, MemberPrivateKey: formed.memberPrivateKey ?? null, Type: 'c', FounderOwnerKey: null, FounderPeerId: null };
await B.addStrand({ strandRow: bRow,
  sAppConfig: V1, awaitFirstSync: false });
const bInst = await B.whenStrandWritable(formed.strandId, { timeoutMs: 300_000 });
await bInst.database.getDatabase().exec(`insert into App.Message (Id, Content) values ('b1', 'from b')`);
for (;;) {
  let n = 0;
  for await (const _ of founded.instance.database.getDatabase().eval('select Id from App.Message')) n++;
  if (n >= 2) break;
  await new Promise(r => setTimeout(r, 200));
}
log('both parties hold both rows; B stops for good, A restarts with', CHANGE === 'tag' ? 'one column tag added (v1.1.0)' : 'the same schema (v1.0.0)', OFFLINE ? '[offline mode]' : '');
await B.stop();
{
  await new Promise(r => setTimeout(r, 3000));
  const ids = [];
  try { for await (const r of founded.instance.database.getDatabase().eval('select Id from App.Message')) ids.push(r.Id); } catch (e) { log('read failed:', e.message); }
  log(`B stopped, A not restarted yet: A reads ${ids.join(', ')}`);
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
      await A.addStrand({ strandRow: strand, sAppConfig: V2, awaitFirstSync: false });
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
  log('rows:', ids.join(', '));
  log(`A reads ${rows} rows; app schema state: ${db?.appSchemaState?.() ?? '?'}`);
  // RETURN=1: B comes back (upgraded too). The deferred apply should land once A's strand
  // node connects to it (sereus 1.20: `strand:app-schema-applied`).
  if (process.env.RETURN === '1') {
    const applied = new Promise(r => A.on('strand:app-schema-applied', ({ strandId: id }) => { if (id === strandId) r(Date.now()); }));
    const t = Date.now();
    const B2 = await party('b', bParty);
    await B2.addStrand({ strandRow: bRow, sAppConfig: V2, awaitFirstSync: false });
    log('B is back');
    const at = await Promise.race([applied, new Promise(r => setTimeout(() => r(null), 360_000))]);
    log(at ? `schema applied on A ${((at - t) / 1000).toFixed(1)} s after B returned; state: ${db?.appSchemaState?.()}`
      : `schema NOT applied within 360 s; state: ${db?.appSchemaState?.()}`);
    await B2.stop();
  }
  for (const wait of [5, 30]) {
    await new Promise(r => setTimeout(r, wait * 1000));
    const again = [];
    try { for await (const r of db.getDatabase().eval('select Id from App.Message')) again.push(r.Id); } catch (e) { log('read failed:', e.message); }
    log(`after ${wait} s more: rows ${again.join(', ')}`);
  }
}
await A.stop();
process.exit(0);
