/**
 * CadreService — singleton wrapper around @serfab/cadre-core CadreNode.
 *
 * Step 1 (smoke test): just brings up the control network and identity.
 *   - Open control LevelDB
 *   - Load/create persistent Ed25519 peer key
 *   - Load/create party ID (AsyncStorage)
 *   - Start CadreNode in transaction profile, solo (no bootstrap nodes)
 *
 * Strand creation is added in Step 2.
 *
 * Boundary: this file must not import anything chat-specific.  It is a
 * candidate for upstream extraction into `@sereus/cadre-rn-ui` (engine).
 *
 * References:
 *   sereus/packages/cadre-core/README.md
 *   sereus/packages/reference-app-rn/src/cadre-phone.ts
 *   ser/health/apps/mobile/src/services/CadreService.ts
 */

import {
  CadreNode,
  type CadreNodeConfig,
  type CadreNodeEvents,
  type ControlDatabase,
  type StrandInstance,
} from '@serfab/cadre-core';
import { webSockets } from '@libp2p/websockets';
// TODO(step-4+): re-add `circuitRelayTransport` from @libp2p/circuit-relay-v2
// once we wire up partner-dialing.  Direct dep on circuit-relay-v2 pulls in a
// newer @libp2p/peer-collections than the rest of the workspace, breaking type
// identity with cadre-core; resolve via a `resolutions:` pin at that point.
import {
  LevelDBRawStorage,
  openOptimysticRNDb,
  loadOrCreateRNPeerKey,
} from '@optimystic/db-p2p-storage-rn';
import { LevelDB, LevelDBWriteBatch } from 'rn-leveldb';
import AsyncStorage from '@react-native-async-storage/async-storage';

// TODO(extraction): replace this one chat-aware import with a configure({
// sAppId }) call before ensureStarted, so the cadre layer is a clean
// candidate for `@sereus/cadre-rn-ui` extraction.
import { CHAT_SAPP_ID } from '../data/chat-sapp';

type OptimysticDb = ReturnType<typeof openOptimysticRNDb>;
type EventHandler<T> = (payload: T) => void;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PARTY_ID_KEY = '@sereus.chat/partyId';

/**
 * LevelDB directory naming for optimystic stores.
 * Each strand (plus the control network, strandId='control') gets its own
 * native LevelDB directory.
 */
export const OPTIMYSTIC_DB_PREFIX = 'optimystic-chat-';

function optimysticDbName(strandId: string): string {
  return `${OPTIMYSTIC_DB_PREFIX}${strandId}`;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

class CadreServiceImpl {
  private node: CadreNode | null = null;
  private _partyId: string | null = null;
  private _startError: string | null = null;
  private _startPromise: Promise<void> | null = null;

  /**
   * LevelDB handles open for the lifetime of this service.
   * `rn-leveldb` allows exactly one open handle per database name, so this
   * cache is mandatory.  Keyed by strandId (with 'control' for the control
   * network).  Closed in stop().
   */
  private readonly openDbs = new Map<string, OptimysticDb>();

  get isRunning(): boolean {
    return this.node?.isRunning ?? false;
  }

  get partyId(): string | null {
    return this._partyId;
  }

  get peerId(): string | undefined {
    return this.node?.peerId?.toString();
  }

  get startError(): string | null {
    return this._startError;
  }

  get cadreNode(): CadreNode | null {
    return this.node;
  }

  get controlDatabase(): ControlDatabase | null {
    return this.node?.getControlDatabase() ?? null;
  }

  /** Live snapshot of strand instances managed by this node. */
  getStrands(): Map<string, StrandInstance> {
    return this.node?.getStrands() ?? new Map();
  }

  /** Look up a single strand by id (null if not attached). */
  getStrand(strandId: string): StrandInstance | null {
    return this.node?.getStrands().get(strandId) ?? null;
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  /**
   * Ensure the CadreNode is started.  Idempotent — concurrent callers share
   * the same in-flight promise.
   */
  async ensureStarted(): Promise<void> {
    if (this.node?.isRunning) return;
    if (this._startPromise) return this._startPromise;

    this._startPromise = this.doStart();
    try {
      await this._startPromise;
    } catch {
      this._startPromise = null;
      throw new Error(this._startError ?? 'CadreService failed to start');
    }
  }

  private async doStart(): Promise<void> {
    this._startError = null;

    try {
      this._partyId = await this.getOrCreateValue(PARTY_ID_KEY);
      console.info('[CadreService] party ID:', this._partyId);

      // Open the control LevelDB up-front so we can both load the persistent
      // peer identity and reuse the same handle when CadreNode asks for
      // strandId='control' through the storage provider.
      const controlDb = this.getOrOpenDb('control');
      const privateKey = await loadOrCreateRNPeerKey(controlDb);
      console.info('[CadreService] loaded peer identity from control store');

      const config: CadreNodeConfig = {
        privateKey,
        controlNetwork: {
          partyId: this._partyId,
          bootstrapNodes: [],
        },
        profile: 'transaction',
        // Only join strands tagged with our chat sAppId.
        strandFilter: { mode: 'sAppId', sAppId: CHAT_SAPP_ID },
        storage: {
          provider: (strandId: string) => new LevelDBRawStorage(this.getOrOpenDb(strandId)),
        },
        network: {
          transports: [webSockets()],
          // RN cannot listen for inbound connections.
          listenAddrs: [],
        },
      };

      console.info('[CadreService] creating CadreNode...');
      this.node = new CadreNode(config);
      console.info('[CadreService] starting CadreNode...');
      await this.node.start();
      console.info(
        '[CadreService] ✓ CadreNode running. Peer ID:',
        this.node.peerId?.toString(),
      );
    } catch (err) {
      this._startError = err instanceof Error ? err.message : String(err);
      console.error('[CadreService] doStart failed:', this._startError);
      throw err;
    }
  }

  /** Stop the CadreNode gracefully.  Idempotent. */
  async stop(): Promise<void> {
    if (this.node) {
      await this.node.stop();
      this.node = null;
    }
    // Release rn-leveldb per-name locks; without this a subsequent
    // open() on the same name throws "DB is open".
    for (const [strandId, db] of this.openDbs) {
      try {
        await db.close();
      } catch (e) {
        console.warn(`[CadreService] close LevelDB ${strandId} failed:`, e);
      }
    }
    this.openDbs.clear();
    this._startPromise = null;
  }

  // -----------------------------------------------------------------------
  // LevelDB handle cache
  // -----------------------------------------------------------------------

  private getOrOpenDb(strandId: string): OptimysticDb {
    let db = this.openDbs.get(strandId);
    if (!db) {
      db = openOptimysticRNDb({
        openFn: (name, createIfMissing, errorIfExists) =>
          new LevelDB(name, createIfMissing, errorIfExists),
        WriteBatch: LevelDBWriteBatch,
        name: optimysticDbName(strandId),
      });
      this.openDbs.set(strandId, db);
    }
    return db;
  }

  // -----------------------------------------------------------------------
  // Events
  // -----------------------------------------------------------------------

  on<K extends keyof CadreNodeEvents>(
    event: K,
    handler: EventHandler<CadreNodeEvents[K]>,
  ): void {
    this.node?.on(event, handler);
  }

  off<K extends keyof CadreNodeEvents>(
    event: K,
    handler: EventHandler<CadreNodeEvents[K]>,
  ): void {
    this.node?.off(event, handler);
  }

  // -----------------------------------------------------------------------
  // Persistence helpers
  // -----------------------------------------------------------------------

  private async getOrCreateValue(key: string): Promise<string> {
    const stored = await AsyncStorage.getItem(key);
    if (stored) return stored;
    const id = generateUuid();
    await AsyncStorage.setItem(key, id);
    return id;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Lightweight UUID v4 using crypto.getRandomValues (polyfilled in index.js). */
function generateUuid(): string {
  const bytes = new Uint8Array(16);
  const g = globalThis as Record<string, unknown>;
  const c = (g.crypto ?? {}) as { getRandomValues?: (buf: Uint8Array) => void };
  if (typeof c.getRandomValues === 'function') {
    c.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

export const cadreService = new CadreServiceImpl();
export default cadreService;
