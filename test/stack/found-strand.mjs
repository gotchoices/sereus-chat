/**
 * Does founding one strand converge?
 *
 * This is the smallest question our app cannot answer on a device: chat, health
 * and VoteTorrent all found a strand over `LevelDBRawStorage`, and for two of the
 * three it never completes.  The upstream integration suite injects
 * `MemoryRawStorage` and so never exercises that adapter in composition with the
 * cadre/optimystic stack above it.
 *
 * So this run puts the REAL adapter over a REAL on-disk LevelDB, in Node, with one
 * node, one table, and nothing else:
 *
 *     LevelDBRawStorage  (@optimystic/db-p2p-storage-rn — what the phone runs)
 *        └─ LevelDBLike over classic-level  (instead of the rn-leveldb native module)
 *
 * PASS  → the adapter and storage are not the variable; the gap is native/device
 *         (bridge crossings, Hermes) and belongs in an on-device benchmark.
 * FAIL  → the defect reproduces in Node, under a debugger, with no device at all —
 *         which is the artifact upstream is missing.
 *
 * Either outcome is worth having, which is the point of running it.
 *
 * Usage:  yarn stack:check   [STRAND_TIMEOUT_MS=600000]
 */
import { CadreNode } from '@serfab/cadre-core';
import { LevelDBRawStorage } from '@optimystic/db-p2p-storage-rn';
import { webSockets } from '@libp2p/websockets';
import { generateKeyPair } from '@libp2p/crypto/keys';
import { randomUUID } from 'node:crypto';
import { openTestDb } from './classic-level-driver.mjs';

const TIMEOUT_MS = Number(process.env.STRAND_TIMEOUT_MS ?? 10 * 60 * 1000);
/** Sleep before every raw-storage op — stands in for RN's bridge cost. */
const OP_DELAY_MS = Number(process.env.STORAGE_OP_DELAY_MS ?? 0);

/** One table, three columns — as small as a real schema gets. */
const SCHEMA = `table Member (
    Id text primary key,
    Name text not null,
    AvatarUri text
);`;

const SAPP = {
  id: 'org.sereus.chat.stackcheck',
  version: '0.1.0',
  schema: SCHEMA,
  signature: '',
  latencyHint: 'interactive',
};

const dbs = [];
function storageFor(strandId) {
  const handle = openTestDb(`stack-check-${strandId}`, OP_DELAY_MS);
  dbs.push(handle);
  return new LevelDBRawStorage(handle.db);
}

const started = Date.now();
const since = () => `${((Date.now() - started) / 1000).toFixed(1)}s`;
const log = (...a) => console.log(`[${since()}]`, ...a);

let node;
try {
  const partyId = randomUUID();
  log('party', partyId, OP_DELAY_MS ? `(storage op delay ${OP_DELAY_MS}ms)` : '(no storage delay)');

  // An EXPLICIT Ed25519 identity, as the app supplies via `loadOrCreateRNPeerKey`.
  // Without one libp2p mints an ephemeral key, which exposes no owner key — so
  // owner genesis cannot sign, and the Strand insert has no authorized signer.
  const privateKey = await generateKeyPair('Ed25519');

  node = new CadreNode({
    controlNetwork: { partyId, bootstrapNodes: [] },
    profile: 'transaction',
    strandFilter: { mode: 'all' },
    // The whole point: the phone's adapter, over a real on-disk LevelDB.
    storage: { provider: (strandId) => storageFor(strandId) },
    network: {
      transports: [webSockets()],
      // Node CAN listen, unlike RN. Kept deliberately minimal — a solo founder
      // needs no reachability, and an unfilled circuit listener is a difference
      // we have already ruled out on device.
      // RN cannot listen at all, so LISTEN_ADDRS lets us match the phone exactly:
      //   LISTEN_ADDRS=none  → listenAddrs: []            (what the phone runs)
      //   default            → a loopback ws listener     (what Node can do)
      // Controls for whether "Node has a listen address and the phone does not"
      // is the variable.
      listenAddrs: process.env.LISTEN_ADDRS === 'none' ? [] : ['/ip4/127.0.0.1/tcp/0/ws'],
    },
    privateKey,
    hibernation: { enabled: false },
    // Our sApp config is unsigned (its id is a name, not an author key), same as
    // the reference app's demo opt-out.
    requireSignedSchemas: false,
  });

  log('starting node…');
  await node.start();
  log('node running, peer', node.peerId?.toString?.() ?? '(unknown)');

  // Owner genesis — the node must be its own owner to sign the Strand insert.
  const { privateKeyB64, publicKeyB64 } = node.getIdentityOwnerKey();
  const control = node.getControlDatabase();
  if (!control) throw new Error('no control database after start');
  await control.ensureOwnerKey(publicKeyB64);
  node.initializeSeedBootstrap(privateKeyB64);
  log('owner genesis done');

  const strandId = randomUUID();
  log('founding strand', strandId, `(timeout ${TIMEOUT_MS / 1000}s)`);

  const t0 = Date.now();
  const result = await Promise.race([
    node.foundStrand({ strandId, type: 'o', sAppConfig: SAPP }),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`DID NOT CONVERGE within ${TIMEOUT_MS / 1000}s`)), TIMEOUT_MS)),
  ]);
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  log(`✓ CONVERGED in ${elapsed}s — founded=${result.founded}`);
  console.log('\nPASS — the RN storage adapter over real on-disk LevelDB converges in Node.');
  console.log('So storage semantics are not the variable; look native/device-side.');
  process.exitCode = 0;
} catch (err) {
  console.error(`\n[${since()}] FAIL —`, err?.message ?? err);
  console.error('\nIf this is a timeout, the defect reproduces in Node with no device:');
  console.error('  · one node, one table, no peers, no relay');
  console.error('  · the phone\'s own LevelDBRawStorage over classic-level');
  console.error('Re-run with DEBUG=optimystic:*,sereus:cadre:* for the block-level trace.');
  process.exitCode = 1;
} finally {
  try { await node?.stop?.(); } catch { /* best effort */ }
  for (const d of dbs) { try { await d.cleanup(); } catch { /* best effort */ } }
  // libp2p leaves timers and sockets holding the event loop open, so the process
  // lingers long after the result is known. Exit on the answer, not on quiescence
  // — otherwise a passing run looks like a hang, which is exactly the thing this
  // harness exists to measure.
  process.exit(process.exitCode ?? 0);
}
