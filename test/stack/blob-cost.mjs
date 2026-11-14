/**
 * What a large write costs in a strand, without a phone or a public relay in the way: per
 * transaction against per byte, the chat blob store end to end (docs/blobs.md), and a read of the
 * blob on the other member. Two parties on one chat strand (sApp 0.4.0, which has the blob
 * tables), loopback WebSockets, file storage.
 *
 *   node test/stack/blob-cost.mjs
 *   OFFLINE=1 node test/stack/blob-cost.mjs        # strand offline mode: commit = saved here
 *   MB=14 node test/stack/blob-cost.mjs            # the end-to-end put's size (default 4)
 *   PROFILE=<file> node …                          # a CPU profile of one 8-chunk commit
 *
 * First result (2026-11-13, Node 24, optimystic 1.26): about 0.6 MB/s, per byte rather than per
 * transaction (a tiny commit 126 ms; 1 chunk 418 ms; 8 chunks 3.9 s), and 16 chunks (4.2 MB raw)
 * encode to 14.3 MB, over the 7.5 MiB transaction limit: each value travels ~2.5 times.
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
import { getChatSAppConfig, CHAT_SAPP_ID } from '@chat/core';
import { putBlob, readBlob } from '@chat/core/sereus';

const OFFLINE = process.env.OFFLINE === '1';
const MB = Number(process.env.MB ?? 4);
const root = mkdtempSync(join(tmpdir(), 'blob-cost-'));
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
    profile: 'transaction',
    // The embedder that builds a store closes it (Optimystic IRawStorage.close), below.
    storage: { provider: scope => { const st = new FileRawStorage(join(dir, 'blocks', scope)); built.push(st); return st; } },
    network: { transports: [webSockets()], listenAddrs: ['/ip4/127.0.0.1/tcp/0/ws'], relayAddrs: [], requireRelay: false,
      connectionGater: { denyDialMultiaddr: () => false } },
    strandFilter: { mode: 'sAppId', sAppId: CHAT_SAPP_ID },
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



const sApp = getChatSAppConfig();
const A = await party('a', `a-${randomUUID()}`);
const B = await party('b', `b-${randomUUID()}`);
const strandId = `strand-${randomUUID()}`;
const founded = await A.foundStrand({ strandId, type: 'c', memberPrivateKey: await generateStrandMemberKey(), sAppConfig: sApp });
const aStrand = founded.instance;
const aDb = aStrand.database.getDatabase();
await aDb.exec(`insert into App.Member (Id, Name) values ('a', 'A')`);
const invitation = await A.createOpenInvitation(CHAT_SAPP_ID, 3_600_000);
await A.publishFormationInvite(invitation.token, CHAT_SAPP_ID, { strandId, expiresAtMs: Date.now() + 3_600_000, totalUses: 1 });
const formed = await B.formStrand(B.decodeInvitation(A.encodeInvitation(invitation)), { metadata: { name: 'B' } });
await B.addStrand({ strandRow: { Id: formed.strandId, MemberPrivateKey: formed.memberPrivateKey ?? null, Type: 'c', FounderOwnerKey: null, FounderPeerId: null },
  sAppConfig: sApp, awaitFirstSync: false });
const bStrand = await B.whenStrandWritable(formed.strandId, { timeoutMs: 300_000 });
log(`strand up on both${OFFLINE ? ' [offline mode]' : ''}`);

// 1. Per transaction against per byte: N chunks of 256 KiB in one transaction, and a tiny control.
const CHUNK = 256 * 1024;
const median = xs => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
log('chunks/tx | raw MB | commit ms (median of 3) | MB/s');
for (const n of [0, 1, 4, 8]) {
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

// 2. The blob store end to end, then the read on the other member.
const data = new Uint8Array(randomBytes(Math.round(MB * 1e6)));
async function* pieces() { for (let i = 0; i < data.length; i += 64 * 1024) yield data.subarray(i, i + 64 * 1024); }
let t = Date.now();
const { ref } = await putBlob(aStrand, pieces());
log(`putBlob ${MB} MB: ${Date.now() - t} ms (${(MB / ((Date.now() - t) / 1000)).toFixed(2)} MB/s)`);
t = Date.now();
let got = 0;
for (const deadline = Date.now() + 300_000; Date.now() < deadline;) {
  try { got = 0; for await (const p of readBlob(bStrand, ref)) got += p.length; break; }
  catch (e) { if (e?.name !== 'BlobNotHereError') throw e; await new Promise(r => setTimeout(r, 500)); }
}
log(`readBlob at B: ${got === data.length ? 'whole' : `INCOMPLETE ${got}`} after ${Date.now() - t} ms`);
await Promise.allSettled([A.stop(), B.stop()]);
process.exit(0);
