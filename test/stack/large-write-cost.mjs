/**
 * What a large write costs in a strand: commit time against bytes, two parties on one strand,
 * loopback WebSockets, file storage, no relay. N blob values of 256 KiB in one transaction, and a
 * tiny control transaction. Only stack packages (sereus cadre-core, optimystic, libp2p).
 *
 *   node large-write-cost.mjs
 *   OFFLINE=1 node large-write-cost.mjs          # strand offline mode
 *   PROFILE=<file> node large-write-cost.mjs     # a CPU profile of one 8-value commit
 *   CHUNKS=16 node large-write-cost.mjs          # 4.2 MB raw: refused, encoding to ~14.3 MB
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
import { randomBytes, createHash } from 'node:crypto';

const OFFLINE = process.env.OFFLINE === '1';
const root = mkdtempSync(join(tmpdir(), 'large-write-'));
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);
// The stack logs freely; keep only ours (the blob store's own summary lines included).
const out = console.log.bind(console);
console.info = (...a) => { if (String(a[0]).startsWith('[blob]')) out('   ', ...a); };
console.warn = () => {}; console.debug = () => {};

async function party(tag, partyId) {
  const dir = join(root, tag);
  const keyStore = new FileKeyStore(join(dir, 'keys'));
  const journals = new Map();
  const built = [];
  const node = new CadreNode({
    keyStore, identityKeyId: DEFAULT_IDENTITY_KEY_ID,
    controlNetwork: { partyId, bootstrapNodes: [] },
    nodeClass: 'device',
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



const SAPP_ID = 'org.example.large-write';
const sApp = { id: SAPP_ID, version: '1.0.0', signature: '', schemaVersion: 1, latencyHint: 'interactive',
  schema: `table Member (Id text primary key, Name text not null);
  table BlobChunk (Hash text primary key, Bytes blob not null);` };
const A = await party('a', `a-${randomUUID()}`);
const B = await party('b', `b-${randomUUID()}`);
const strandId = `strand-${randomUUID()}`;
const founded = await A.foundStrand({ strandId, type: 'c', memberPrivateKey: await generateStrandMemberKey(), sAppConfig: sApp });
const aStrand = founded.instance;
const aDb = aStrand.database.getDatabase();
await aDb.exec(`insert into App.Member (Id, Name) values ('a', 'A')`);
const invitation = await A.createOpenInvitation(SAPP_ID, 3_600_000);
await A.publishFormationInvite(invitation.token, SAPP_ID, { strandId, expiresAtMs: Date.now() + 3_600_000, totalUses: 1 });
const formed = await B.formStrand(B.decodeInvitation(A.encodeInvitation(invitation)), { metadata: { name: 'B' } });
await B.addStrand({ strandRow: { Id: formed.strandId, MemberPrivateKey: formed.memberPrivateKey ?? null, Type: 'c', FounderOwnerKey: null, FounderPeerId: null },
  sAppConfig: sApp, awaitFirstSync: false });
const bStrand = await B.whenStrandWritable(formed.strandId, { timeoutMs: 300_000 });
log(`strand up on both${OFFLINE ? ' [offline mode]' : ''}`);

// 1. Per transaction against per byte: N chunks of 256 KiB in one transaction, and a tiny control.
const CHUNK = 256 * 1024;
const median = xs => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
log('chunks/tx | raw MB | commit ms (median of 3) | MB/s');
for (const n of (process.env.CHUNKS ?? '0,1,4,8').split(',').map(Number)) {
  const ms = [];
  for (let rep = 0; rep < 3; rep++) {
    const t = Date.now();
    await aDb.exec('begin');
    if (n === 0) await aDb.exec(`insert or ignore into App.Member (Id, Name) values (?, 'x')`, [`m-${n}-${rep}-${Date.now()}`]);
    for (let i = 0; i < n; i++) {
      const bytes = new Uint8Array(randomBytes(CHUNK));
      await aDb.exec('insert or ignore into App.BlobChunk (Hash, Bytes) values (?, ?)', [createHash('sha256').update(bytes).digest('hex'), bytes]);
    }
    await aDb.exec('commit');
    ms.push(Date.now() - t);
  }
  const raw = (n * CHUNK) / 1e6;
  log(`${String(n).padStart(9)} | ${raw.toFixed(2).padStart(6)} | ${String(median(ms)).padStart(23)} | ${n ? (raw / (median(ms) / 1000)).toFixed(2) : '-'}   [${ms.join(', ')}]`);
}

if (process.env.PROFILE) {
  const { Session } = await import('node:inspector/promises');
  const { writeFileSync } = await import('node:fs');
  const session = new Session(); session.connect();
  await session.post('Profiler.enable'); await session.post('Profiler.start');
  await aDb.exec('begin');
  for (let i = 0; i < 8; i++) {
    const bytes = new Uint8Array(randomBytes(CHUNK));
    await aDb.exec('insert or ignore into App.BlobChunk (Hash, Bytes) values (?, ?)', [createHash('sha256').update(bytes).digest('hex'), bytes]);
  }
  await aDb.exec('commit');
  const { profile } = await session.post('Profiler.stop');
  writeFileSync(process.env.PROFILE, JSON.stringify(profile));
  log(`profile of one 8-chunk commit -> ${process.env.PROFILE}`);
}

await Promise.allSettled([A.stop(), B.stop()]);
process.exit(0);
