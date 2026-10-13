/**
 * Found one strand, over one table, on one node with no peers — and time it.
 *
 * The A/B this exists for: in Node this converges in about 0.2 s; on a phone it once did
 * not converge in 44 minutes. One function runs on both sides, and the caller supplies only
 * what differs between them — the block storage (the phone's LevelDB, or classic-level or
 * memory in Node), the transports, and an Ed25519 identity — so a difference in the result
 * points at the runtime or the storage adapter, not at the code.
 *
 * Isolated: its own party, its own node and storage names; it touches no app data. A slow
 * result on a phone is an upper bound, since the app's own node competes for the CPU.
 */
import { CadreNode, type CadreNodeConfig, type SAppConfig } from '@serfab/cadre-core';

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
} as SAppConfig;

type Storage = NonNullable<CadreNodeConfig['storage']>;
type Network = NonNullable<CadreNodeConfig['network']>;

/** What the platform supplies. */
export interface FoundStrandPlatform {
  /** Block storage for one storage scope; a fresh store per name, never the app's own. */
  storage: Storage['provider'];
  transports: Network['transports'];
  /** A fresh Ed25519 identity (an ephemeral libp2p key exposes no owner key to sign with). */
  privateKey: NonNullable<CadreNodeConfig['privateKey']>;
  /** Listen addresses; default none, like a phone. */
  listenAddrs?: string[];
  /** Release the storage afterwards (close databases, delete files). */
  cleanup?(): Promise<void> | void;
}

export interface FoundStrandOptions {
  /** Give up after this long and report it as a non-convergence. Default 10 minutes. */
  timeoutMs?: number;
  /** `all` matches the reference apps; `sAppId` matches what the chat apps pass. */
  strandFilter?: 'all' | 'sAppId';
  onProgress?: (line: string) => void;
}

export interface FoundStrandResult {
  converged: boolean;
  elapsedMs: number;
  detail: string;
  log: string[];
}

export async function runFoundStrandCheck(platform: FoundStrandPlatform, opts: FoundStrandOptions = {}): Promise<FoundStrandResult> {
  const timeoutMs = opts.timeoutMs ?? 10 * 60 * 1000;
  const started = Date.now();
  const log: string[] = [];
  const say = (line: string) => {
    const stamped = `[${((Date.now() - started) / 1000).toFixed(1)}s] ${line}`;
    log.push(stamped);
    opts.onProgress?.(stamped);
  };
  const id = Math.random().toString(36).slice(2, 10);

  let node: CadreNode | null = null;
  try {
    const partyId = `diag-${id}`;
    say(`party ${partyId}`);
    node = new CadreNode({
      privateKey: platform.privateKey,
      controlNetwork: { partyId, bootstrapNodes: [] },
      profile: 'transaction',
      strandFilter: opts.strandFilter === 'sAppId' ? { mode: 'sAppId', sAppId: SAPP.id } : { mode: 'all' },
      storage: { provider: platform.storage },
      network: { transports: platform.transports, listenAddrs: platform.listenAddrs ?? [] },
      hibernation: { enabled: false },
      requireSignedSchemas: false,
    } as CadreNodeConfig);
    say('starting node…');
    await node.start();
    say(`node running, peer ${node.peerId?.toString() ?? '(unknown)'}`);

    const owner = node.getIdentityOwnerKey();
    const control = node.getControlDatabase();
    if (!control) throw new Error('no control database after start');
    await control.ensureOwnerKey(owner.publicKeyB64);
    await node.initializeSeedBootstrap(owner.privateKeyB64);
    say('owner genesis done');

    const strandId = `diag-strand-${id}`;
    say(`founding ${strandId} (timeout ${Math.round(timeoutMs / 1000)} s)`);
    const t0 = Date.now();
    const result = await Promise.race([
      node.foundStrand({ strandId, type: 'o', sAppConfig: SAPP }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`did not converge within ${Math.round(timeoutMs / 1000)} s`)), timeoutMs)),
    ]);
    const elapsedMs = Date.now() - t0;
    say(`✓ converged in ${(elapsedMs / 1000).toFixed(1)} s — founded=${result.founded}`);
    return { converged: true, elapsedMs, detail: `Converged in ${(elapsedMs / 1000).toFixed(1)} s (founded=${result.founded}).`, log };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    say(`✗ ${message}`);
    return { converged: false, elapsedMs: Date.now() - started, detail: message, log };
  } finally {
    try { await node?.stop(); } catch { /* best effort */ }
    try { await platform.cleanup?.(); } catch { /* best effort */ }
  }
}
