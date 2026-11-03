/**
 * Does `foundStrand` resume after the node stopped while an earlier `foundStrand` of the same
 * strand was still in flight? cadre-core documents it as "one resumable call": a stored row is
 * adopted and founder-ness is read from its `FounderPeerId`.
 *
 * One party, one machine, no bootstrap, file storage (stores closed after `stop()`). Run 1 starts
 * `foundStrand` for a closed strand and stops the node mid-founding. Run 2 is a new CadreNode over
 * the same files, keys and party id; it calls `foundStrand` again for the same strand id with a
 * freshly minted member key, as an app that mints one per attempt does, and reports the outcome.
 *
 *   STOP_AFTER_MS=300   stop the node this long after run 1's foundStrand call (default 300)
 *   STOP_AT=published   instead, stop as soon as the Strand row is readable in the control database
 *                       (MODE=bg: as soon as the background call resolves, i.e. the row is published)
 *   STOP_AT=app-schema  instead, stop the moment the strand's storage saves the pending record of the
 *                       sApp's DDL write (the `App.Label` catalog entry into `optimystic/schema`):
 *                       between that write's pend and its commit. Deterministic.
 *   EXIT_AFTER_MS=5000  run 1 in its own process, which exits this long after it calls stop() whether or
 *                       not stop() has finished, closing the stores only if it has (what serchat's CLI
 *                       does: `Promise.race([stop(), 5 s])`, then `process.exit`)
 *   EXIT_AFTER_MS=0     run 1 in its own process: at the stop point, close (flush) the stores and exit
 *                       without stop() at all — a crash after the stores are durable
 *   MODE=fg|bg          run 1 founds in the foreground (default) or with { background: true }
 *   ATTACH=1            run 2 also attaches `strand:discovered` offers, as an app's handler does
 *   SWEEP=0,200,400     run each STOP_AFTER_MS value in its own process and directory, print a table
 *   PROFILE=<dir>       skip run 1: copy a serchat profile (keys/, blocks/, node/, profile.json) to a
 *                       temp dir and run only run 2 on it, for its private strand (serchat's sApp and
 *                       id, `strand-` + sha256("org.sereus.chat.private\n" + partyId)[0..32]). The
 *                       given directory is never written.
 *
 *   node test/stack/interrupted-founding.mjs
 *   SWEEP=0,100,200,300,400,600,800,1200,2000 node test/stack/interrupted-founding.mjs
 *   STOP_AT=app-schema EXIT_AFTER_MS=500 node test/stack/interrupted-founding.mjs          # the failure
 *   MODE=bg STOP_AT=app-schema EXIT_AFTER_MS=500 node test/stack/interrupted-founding.mjs  # same, background form
 *
 * Result (2026-11-02, sereus 1.20.0 / optimystic 1.23.0):
 * - stop() allowed to finish (stores then closed): resumes at every stop point tried (SWEEP 0–1500 ms,
 *   STOP_AT=published, STOP_AT=app-schema), both forms. stop() takes 0.4–5.6 s with a founding in flight.
 * - The process exits while stop() is still running, after the sApp DDL write has pended
 *   (STOP_AT=app-schema EXIT_AFTER_MS=300|500): every later foundStrand fails after 13–20 s with
 *   `SyncRetryExhaustedError: sync for collection optimystic/schema exhausted 10 retries`, both
 *   forms (8 of 8 runs). Timed stops (STOP_AFTER_MS=100|300 EXIT_AFTER_MS=500) fail too when the
 *   exit lands between that write's pend and its commit (3 of 4). STOP_AT=app-schema with
 *   EXIT_AFTER_MS=0 (stores closed at once, no stop()) resumed (2 of 2). On disk the strand's
 *   optimystic/schema tree root and log blocks keep a pending record (`pendingRevs: {<id>: 2}`) for
 *   the dead write, never committed or cancelled, and every new write wants the same rev 2.
 *   serchat's one-shot exit is `Promise.race([stop(), 5 s])` then process.exit: the same shape.
 * - PROFILE=<the preserved serchat profile p1> fails the same way, with the same on-disk fingerprint.
 */
import { cpSync, mkdtempSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { webSockets } from '@libp2p/websockets';
import { CadreNode, DEFAULT_IDENTITY_KEY_ID, generateStrandMemberKey } from '@serfab/cadre-core';
import { FileKeyStore } from '@serfab/cadre-core/key-store-file';
import { runOwnerGenesis } from '@serfab/cadre-core/edge-node';
import { FileTrustedOwnerStore } from '@serfab/cadre-core/trusted-owner-store-file';
import { FileBootstrapPeerStore } from '@serfab/cadre-core/bootstrap-peer-store-file';
import { FileEnrolledMachineStore } from '@serfab/cadre-core/enrolled-machine-store-file';
import { FileStrandNetworkStateStore } from '@serfab/cadre-core/strand-network-state-file';
import { FileRawStorage } from '@optimystic/db-p2p-storage-fs';

if (process.env.SWEEP) {
  for (const ms of process.env.SWEEP.split(',').map(s => s.trim()).filter(Boolean)) {
    const env = { ...process.env, STOP_AFTER_MS: ms };
    delete env.SWEEP;
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], { env, encoding: 'utf8', timeout: 180_000 });
    const result = (r.stdout ?? '').split('\n').find(l => l.startsWith('RESULT')) ?? `RESULT no result (exit ${r.status})`;
    console.log(`STOP_AFTER_MS=${ms.padStart(5)}  ${result}`);
  }
  process.exit(0);
}

const PROFILE = process.env.PROFILE;
const MODE = process.env.MODE ?? 'fg';
const STOP_AT = process.env.STOP_AT ?? 'ms';
const STOP_AFTER_MS = Number(process.env.STOP_AFTER_MS ?? 300);
const SAPP = PROFILE ? {
  // serchat's private strand sApp (packages/core/src/protocol/private-sapp.ts)
  id: 'org.sereus.chat.private', version: '0.1.0', signature: '', latencyHint: 'interactive',
  schema: 'table Label (Key text primary key, Text text not null, UpdatedAt text not null) with tags ("optimystic.network_watch" = true);',
} : {
  id: 'org.example.interrupted-founding', version: '1.0.0', signature: '', latencyHint: 'interactive',
  schema: 'table Label (Key text primary key, Text text not null);',
};

const EXIT_AFTER_MS = process.env.EXIT_AFTER_MS === undefined ? undefined : Number(process.env.EXIT_AFTER_MS);
const RUN1_CHILD = process.env.IF_RUN1_CHILD === '1';
const dir = process.env.IF_DIR ?? mkdtempSync(join(tmpdir(), 'interrupted-founding-'));
if (PROFILE) for (const sub of ['keys', 'blocks', 'node']) cpSync(join(PROFILE, sub), join(dir, sub), { recursive: true });
const partyId = PROFILE ? JSON.parse(readFileSync(join(PROFILE, 'profile.json'), 'utf8')).partyId : process.env.IF_PARTY ?? `party-${randomUUID()}`;
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(2)}s]`, ...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));
// STOP_AT=app-schema: resolved when a strand store saves the pending record of the app DDL write.
let appSchemaPended; const appSchemaPend = new Promise(r => { appSchemaPended = r; });
const watchStore = (scope, st) => {
  if (!scope.startsWith('strand-')) return st;
  const save = st.savePendingTransaction.bind(st);
  st.savePendingTransaction = async (blockId, actionId, transform) => {
    await save(blockId, actionId, transform);
    // Catalog keys are `\u0002<schema>\u0000\u0002<table>\u0000`; JSON escapes the control characters.
    if (JSON.stringify(transform).includes('\\u0002app\\u0000\\u0002Label')) appSchemaPended(true);
  };
  return st;
};

async function startNode() {
  const keyStore = new FileKeyStore(join(dir, 'keys'));
  const built = [];
  const node = new CadreNode({
    keyStore, identityKeyId: DEFAULT_IDENTITY_KEY_ID,
    controlNetwork: { partyId, bootstrapNodes: [] },
    profile: 'transaction',
    // The embedder that builds a store closes it (Optimystic IRawStorage.close), in stop() below.
    storage: { provider: scope => { const st = new FileRawStorage(join(dir, 'blocks', scope)); built.push(st); return watchStore(scope, st); } },
    network: { transports: [webSockets()], listenAddrs: ['/ip4/127.0.0.1/tcp/0/ws'], relayAddrs: [], requireRelay: false,
      connectionGater: { denyDialMultiaddr: () => false } },
    strandFilter: PROFILE ? { mode: 'all' } : { mode: 'sAppId', sAppId: SAPP.id },
    hibernation: { enabled: false },
    requireSignedSchemas: false,
    trustedOwners: { store: await FileTrustedOwnerStore.open(join(dir, 'node'), partyId) },
    bootstrapPeers: { store: await FileBootstrapPeerStore.open(join(dir, 'node'), partyId) },
    enrolledMachines: { store: await FileEnrolledMachineStore.open(join(dir, 'node'), partyId) },
    strandNetworkState: { store: await FileStrandNetworkStateStore.open(join(dir, 'node'), partyId) },
  });
  const stop = node.stop.bind(node);
  node.stop = async () => {
    await stop();
    await Promise.allSettled(built.map(st => st.close?.()));
  };
  node.closeStoresOnly = () => Promise.allSettled(built.map(st => st.close?.()));
  await node.start();
  const genesis = await runOwnerGenesis(node, { keyStore, label: 'test' });
  return { node, genesis };
}

const describeRow = (selfPeer, row) => row
  ? `Strand row present (FounderPeerId ${row.FounderPeerId === selfPeer ? 'is this node' : row.FounderPeerId ? 'is ANOTHER peer' : 'null'})`
  : 'no Strand row';
const settle = p => p.then(v => ({ ok: true, v }), e => ({ ok: false, e }));
const errText = e => `${e?.name ?? 'Error'}: ${String(e?.message ?? e).split('\n')[0].slice(0, 220)}`;

// ---- Run 1: found, and stop mid-founding.
const strandId = PROFILE
  ? `strand-${createHash('sha256').update(`org.sereus.chat.private\n${partyId}`).digest('hex').slice(0, 32)}`
  : process.env.IF_STRAND ?? `strand-${randomUUID()}`;
let node, genesis, selfPeer, stopPoint = 'none (PROFILE)', finishedBeforeStop = false, rowBefore = true;
if (!PROFILE && EXIT_AFTER_MS !== undefined && !RUN1_CHILD) {
  // Run 1 in a child process over the same directory, so it can exit mid-stop.
  const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
    env: { ...process.env, IF_RUN1_CHILD: '1', IF_DIR: dir, IF_PARTY: partyId, IF_STRAND: strandId }, encoding: 'utf8', timeout: 120_000 });
  process.stdout.write(r.stdout ?? '');
  const line = (r.stdout ?? '').split('\n').find(l => l.startsWith('RUN1 ')) ?? 'RUN1 stop=? first=?';
  stopPoint = /stop=(.*) first=/.exec(line)?.[1] ?? '?';
  finishedBeforeStop = / first=settled/.test(line);
} else if (!PROFILE) {
({ node, genesis } = await startNode());
selfPeer = node.peerId.toString();
log(`run 1: started, genesis ${genesis}, founding ${MODE === 'bg' ? 'with { background: true }' : 'in the foreground'}`);
const tFound = Date.now();
const call = node.foundStrand({ strandId, type: 'c', memberPrivateKey: await generateStrandMemberKey(), sAppConfig: SAPP },
  ...(MODE === 'bg' ? [{ background: true }] : []));
const first = settle(call.then(r => (MODE === 'bg' ? settle(r.ready).then(s => { if (!s.ok) throw s.e; return r; }) : r)));
if (STOP_AT === 'published') {
  if (MODE === 'bg') { await settle(call); }
  else {
    for (;;) {
      const row = await node.getControlDatabase().queryStrand(strandId).catch(() => undefined);
      if (row) break;
      if (await Promise.race([first.then(() => true), sleep(5).then(() => false)])) break;
    }
  }
  stopPoint = `row published (+${Date.now() - tFound} ms)`;
} else if (STOP_AT === 'app-schema') {
  const hit = await Promise.race([appSchemaPend, first.then(() => null)]);
  stopPoint = hit ? `app DDL pended (+${Date.now() - tFound} ms)` : `founding settled first (+${Date.now() - tFound} ms)`;
} else {
  await Promise.race([sleep(STOP_AFTER_MS), first]);
  stopPoint = `+${Date.now() - tFound} ms`;
}
finishedBeforeStop = await Promise.race([first.then(() => true), sleep(0).then(() => false)]);
log(`run 1: stopping at ${stopPoint}; first founding ${finishedBeforeStop ? 'had already settled' : 'still in flight'}`);
rowBefore = await node.getControlDatabase().queryStrand(strandId).catch(() => undefined);
if (RUN1_CHILD) {
  let how;
  if (EXIT_AFTER_MS === 0) { await node.closeStoresOnly(); how = 'exit without stop(), stores closed'; }
  else {
    const t = Date.now();
    const stopped = await Promise.race([node.stop().then(() => true, () => true), sleep(EXIT_AFTER_MS).then(() => false)]);
    how = stopped ? `stop() finished in ${Date.now() - t} ms, stores closed` : `stop() still running at ${EXIT_AFTER_MS} ms: exit, stores NOT closed`;
  }
  log(`run 1: ${how}; ${describeRow(selfPeer, rowBefore)}`);
  console.log(`RUN1 stop=${stopPoint}, ${how} first=${finishedBeforeStop ? 'settled' : 'in-flight'}`);
  process.exit(0);
}
await node.stop();
const r1 = await Promise.race([first, sleep(20_000).then(() => ({ ok: false, e: new Error('did not settle within 20 s of stop') }))]);
log(`run 1: first founding ${r1.ok ? 'resolved' : `rejected (${errText(r1.e)})`}; at stop: ${describeRow(selfPeer, rowBefore)}`);
}

// ---- Run 2: same files, keys, party; found again.
({ node, genesis } = await startNode());
selfPeer ??= node.peerId.toString();
log(`run 2: started, genesis ${genesis}; ${describeRow(selfPeer, await node.getControlDatabase().queryStrand(strandId).catch(() => undefined))}`);
if (process.env.ATTACH === '1') {
  const attach = (id, strandRow) => { if (id === strandId && !node.getStrands().has(id)) node.addStrand({ strandRow, sAppConfig: SAPP }).catch(e => log(`run 2: attach failed: ${errText(e)}`)); };
  node.on('strand:discovered', ({ strandId: id, strand }) => attach(id, strand));
  for (const [id, row] of node.getDiscoveredStrands()) attach(id, row);
}
const t2 = Date.now();
const r2 = await Promise.race([
  settle(node.foundStrand({ strandId, type: 'c', memberPrivateKey: await generateStrandMemberKey(), sAppConfig: SAPP })),
  sleep(90_000).then(() => ({ ok: false, e: new Error('no result within 90 s') })),
]);
const ms2 = Date.now() - t2;
let readable = '';
if (r2.ok) {
  try {
    const db = r2.v.instance.database.getDatabase();
    await db.exec(`insert into App.Label (Key, Text${PROFILE ? ', UpdatedAt' : ''}) values ('k', 'v'${PROFILE ? ", 'now'" : ''})`);
    let n = 0; for await (const _ of db.eval('select Key from App.Label')) n++;
    readable = `, write+read OK (${n} row)`;
  } catch (e) { readable = `, but write/read failed: ${errText(e)}`; }
}
log(`run 2: foundStrand ${r2.ok ? `OK in ${ms2} ms (founded=${r2.v.founded})${readable}` : `FAILED after ${ms2} ms: ${errText(r2.e)}`}`);
console.log(`RESULT mode=${MODE} stop=${stopPoint} first=${finishedBeforeStop ? 'settled-before-stop' : 'in-flight'}/${rowBefore ? 'row' : 'no-row'} ` +
  `resume=${r2.ok ? `OK ${ms2}ms` : `FAILED ${ms2}ms ${errText(r2.e)}`}`);
await settle(node.stop());
log(`files: ${dir}`);
process.exit(0);
