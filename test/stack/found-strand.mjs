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
import { LevelDBRawStorage } from '@optimystic/db-p2p-storage-rn';
import { webSockets } from '@libp2p/websockets';
import { generateKeyPair } from '@libp2p/crypto/keys';
import { runFoundStrandCheck } from '@chat/core/diagnostics';
import { openTestDb } from './classic-level-driver.mjs';

// The check itself is `@chat/core/diagnostics` — the same function the phone's
// Diagnostics screen runs over rn-leveldb. This script supplies the Node side:
// the phone's LevelDBRawStorage over classic-level on disk.
const TIMEOUT_MS = Number(process.env.STRAND_TIMEOUT_MS ?? 10 * 60 * 1000);
const OP_DELAY_MS = Number(process.env.STORAGE_OP_DELAY_MS ?? 0);

const dbs = [];
const result = await runFoundStrandCheck({
  storage: scope => {
    const handle = openTestDb(`stack-check-${scope}`, OP_DELAY_MS);
    dbs.push(handle);
    return new LevelDBRawStorage(handle.db);
  },
  transports: [webSockets()],
  privateKey: await generateKeyPair('Ed25519'),
  listenAddrs: process.env.LISTEN_ADDRS === 'none' ? [] : ['/ip4/127.0.0.1/tcp/0/ws'],
  cleanup: async () => { for (const d of dbs) { try { await d.cleanup(); } catch { /* best effort */ } } },
}, { timeoutMs: TIMEOUT_MS, onProgress: line => console.log(line) });

if (result.converged) {
  console.log('\nPASS — the RN storage adapter over real on-disk LevelDB converges in Node.');
  console.log('So storage semantics are not the variable; look native/device-side.');
} else {
  console.error(`\nFAIL — ${result.detail}`);
  console.error('\nIf this is a timeout, the defect reproduces in Node with no device:');
  console.error('  · one node, one table, no peers, no relay');
  console.error("  · the phone's own LevelDBRawStorage over classic-level");
  console.error('Re-run with DEBUG=optimystic:*,sereus:cadre:* for the block-level trace.');
}
process.exit(result.converged ? 0 : 1);
