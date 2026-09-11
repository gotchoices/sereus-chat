/**
 * The Node harness (`test/stack/found-strand.mjs`), run inside React Native.
 *
 * That harness founds one strand, over one table, on one node, through
 * `LevelDBRawStorage` — and converges in ~0.2 s. The same founding on a device has
 * not converged in 44 minutes. Everything we can vary from outside has been ruled
 * out (schema size, stale data, the founding race, listen addresses, read-repair,
 * beta.2 vs beta.3), so the remaining difference is the RUNTIME itself.
 *
 * This module is the other arm of that A/B. It is deliberately a near-transcription
 * of the Node script rather than a use of the app's own `CadreService`, because the
 * value is in the two runs differing in exactly one thing: Hermes + `rn-leveldb`
 * instead of Node + `classic-level`.
 *
 * ISOLATION. It builds its OWN node — fresh party id, its own LevelDB names under a
 * `diag-` prefix — so a run cannot disturb the app's data or be disturbed by it.
 * That isolation is not free: the app's own (never-converging) strand apply is
 * probably still running while this executes, and competes for the same CPU. Treat
 * a slow result as an upper bound, and see `suppressAppAttach` below.
 */
import { CadreNode } from '@serfab/cadre-core';
import type { CadreNodeConfig, SAppConfig } from '@serfab/cadre-core';
import { generateKeyPair } from '@libp2p/crypto/keys';
import { webSockets } from '@libp2p/websockets';
import { LevelDBRawStorage, openOptimysticRNDb } from '@optimystic/db-p2p-storage-rn';
import { LevelDB, LevelDBWriteBatch } from 'rn-leveldb';

/** One table, three columns — as small as a real schema gets. Same as the Node run. */
const SCHEMA = `table Member (
    Id text primary key,
    Name text not null,
    AvatarUri text
);`;

const SAPP: SAppConfig = {
  id: 'org.sereus.chat.stackcheck',
  version: '0.1.0',
  schema: SCHEMA,
  signature: '',
  latencyHint: 'interactive',
} as SAppConfig;

export type CheckOptions = {
  /** Give up after this long and report it as a non-convergence. */
  timeoutMs?: number;
  /**
   * `all` matches the Node harness and the sereus reference app; `sAppId` matches
   * what our own CadreService passes. A knob because it is one of the few
   * remaining differences between our config and theirs.
   */
  strandFilter?: 'all' | 'sAppId';
  /** Progress for the UI — this can run for minutes. */
  onProgress?: (line: string) => void;
};

export type CheckResult = {
  converged: boolean;
  elapsedMs: number;
  detail: string;
  log: string[];
};

/** A short random suffix, so repeated runs never collide on a LevelDB name. */
function runId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export async function runFoundStrandCheck(opts: CheckOptions = {}): Promise<CheckResult> {
  const timeoutMs = opts.timeoutMs ?? 10 * 60 * 1000;
  const started = Date.now();
  const log: string[] = [];
  const say = (line: string) => {
    const stamped = `[${((Date.now() - started) / 1000).toFixed(1)}s] ${line}`;
    log.push(stamped);
    opts.onProgress?.(stamped);
    console.info('[stack-check]', stamped);
  };

  const id = runId();
  const dbs = new Map<string, ReturnType<typeof openOptimysticRNDb>>();
  const openDb = (name: string) => {
    let db = dbs.get(name);
    if (!db) {
      db = openOptimysticRNDb({
        openFn: (n: string, createIfMissing: boolean, errorIfExists: boolean) =>
          new LevelDB(n, createIfMissing, errorIfExists),
        WriteBatch: LevelDBWriteBatch,
        // `diag-<runId>-` keeps every run in its own database, so nothing here can
        // read, corrupt or lock the app's own `optimystic-chat-*` stores.
        name: `diag-${id}-${name}`,
      });
      dbs.set(name, db);
    }
    return db;
  };

  let node: CadreNode | null = null;
  try {
    // An explicit Ed25519 identity, as the app supplies via `loadOrCreateRNPeerKey`.
    // Without one libp2p mints an ephemeral key, which exposes no owner key, and
    // owner genesis then has nothing to sign the Strand insert with.
    const privateKey = await generateKeyPair('Ed25519');
    const partyId = `diag-${id}`;
    say(`party ${partyId}`);

    const config: CadreNodeConfig = {
      privateKey,
      controlNetwork: { partyId, bootstrapNodes: [] },
      profile: 'transaction',
      strandFilter:
        opts.strandFilter === 'sAppId'
          ? { mode: 'sAppId', sAppId: SAPP.id }
          : { mode: 'all' },
      storage: { provider: (strandId: string) => new LevelDBRawStorage(openDb(strandId)) },
      network: {
        transports: [webSockets()],
        listenAddrs: [],            // RN cannot listen; matches the phone and the Node control run
      },
      hibernation: { enabled: false },
      requireSignedSchemas: false,
    } as CadreNodeConfig;

    say('starting node…');
    node = new CadreNode(config);
    await node.start();
    say(`node running, peer ${node.peerId?.toString?.() ?? '(unknown)'}`);

    const owner = node.getIdentityOwnerKey();
    const control = node.getControlDatabase();
    if (!control) throw new Error('no control database after start');
    await control.ensureOwnerKey(owner.publicKeyB64);
    node.initializeSeedBootstrap(owner.privateKeyB64);
    say('owner genesis done');

    const strandId = `diag-strand-${id}`;
    say(`founding ${strandId} (timeout ${Math.round(timeoutMs / 1000)}s)`);

    const t0 = Date.now();
    const result = await Promise.race([
      node.foundStrand({ strandId, type: 'o', sAppConfig: SAPP }),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`did not converge within ${Math.round(timeoutMs / 1000)}s`)),
          timeoutMs,
        ),
      ),
    ]);
    const elapsedMs = Date.now() - t0;
    say(`✓ CONVERGED in ${(elapsedMs / 1000).toFixed(1)}s — founded=${result.founded}`);

    return {
      converged: true,
      elapsedMs,
      detail: `Converged in ${(elapsedMs / 1000).toFixed(1)}s (founded=${result.founded}).`,
      log,
    };
  } catch (err) {
    const elapsedMs = Date.now() - started;
    const message = err instanceof Error ? err.message : String(err);
    say(`✗ ${message}`);
    return {
      converged: false,
      elapsedMs,
      detail: message,
      log,
    };
  } finally {
    try { await node?.stop?.(); } catch { /* best effort */ }
    for (const db of dbs.values()) {
      try { (db as unknown as { close?: () => void }).close?.(); } catch { /* best effort */ }
    }
  }
}
