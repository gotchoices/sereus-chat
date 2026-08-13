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
  ControlFormationUsageRecorder,
  pinnedKeyTrustPolicy,
  type CadreNodeConfig,
  type CadreNodeEvents,
  type ControlDatabase,
  type StrandInstance,
} from '@serfab/cadre-core';
import { webSockets } from '@libp2p/websockets';
import { circuitRelayTransport } from '@libp2p/circuit-relay-v2';
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
import { withTimeout, OWNER_GENESIS_TIMEOUT_MS } from './async';

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
  private _authorityPublicKey: string | null = null;
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
  // Authority key + seed flows
  // -----------------------------------------------------------------------

  /** True iff authority genesis has run and seed flows are armed. */
  get hasAuthorityKey(): boolean {
    return this._authorityPublicKey !== null;
  }

  /** The authority public key (base64url) — populated by authority genesis. */
  get authorityPublicKey(): string | null {
    return this._authorityPublicKey;
  }

  /**
   * Run owner genesis (cadre-core 0.10).  Idempotent, safe on every start.
   *
   * SINGLE-KEY model: the cadre's owner key IS the node identity
   * (`getIdentityOwnerKey`), not an independent keypair.  `publishStrand`,
   * `publishFormationInvite` and `registerSelf` all sign with the self key,
   * which refuses to sign unless the derived public key matches the control
   * node's PeerId — so there is nothing separate to "create".
   *
   * `ensureOwnerKey` inserts the founding `CadreControl.OwnerKey` row only when
   * the table is empty (bootstrap insert — no existing owners required), then
   * `initializeSeedBootstrap` arms the seed/enrolment flows with the private
   * half.  Mirrors `runOwnerGenesis` in reference-app-rn/src/cadre-phone.ts.
   *
   * Logs elapsed time: the reference documents the solo (cadre-of-one) control
   * path completing in milliseconds (`control-database-solo.spec.ts`).  This is
   * chat's independent check of that on a real device.
   */
  private async runOwnerGenesis(): Promise<string> {
    if (!this.node) throw new Error('CadreNode not running');
    const t0 = Date.now();

    // Throws on an ephemeral libp2p identity; we always pass an explicit
    // Ed25519 `privateKey`, so the identity is resolved and Ed25519.
    const { privateKeyB64, publicKeyB64 } = this.node.getIdentityOwnerKey();

    const controlDb = this.node.getControlDatabase();
    if (!controlDb) throw new Error('Control database not available');

    const inserted = await controlDb.ensureOwnerKey(publicKeyB64);
    this.node.initializeSeedBootstrap(privateKeyB64);
    this._authorityPublicKey = publicKeyB64;

    console.info(
      `[CadreService] ✓ owner genesis in ${Date.now() - t0}ms — ` +
        (inserted ? 'inserted founding OwnerKey' : 'OwnerKey already present') +
        ', seed flows enabled',
    );
    return publicKeyB64;
  }

  /**
   * Public entry point for the "create authority key" UI affordance.  Under
   * the 0.8 single-key model there is nothing to *create* — the key already
   * exists as the node identity — so this just runs (idempotent) genesis and
   * surfaces failures to the caller.
   */
  async createAuthorityKey(): Promise<{ publicKey: string }> {
    await this.ensureStarted();
    const publicKey = await this.runOwnerGenesis();
    return { publicKey };
  }

  /**
   * Reveal the authority private key for offline backup.  Use only from
   * explicit user-confirmed UI ("Export key for recovery") — never log it.
   *
   * Because authority == node identity, this IS the device's identity secret.
   * It is derived on demand from the identity key held in the control
   * LevelDB; it is never copied into AsyncStorage.
   */
  async exportAuthorityPrivateKey(): Promise<string | null> {
    await this.ensureStarted();
    if (!this.node) return null;
    try {
      return this.node.getIdentityOwnerKey().privateKeyB64;
    } catch (err) {
      console.warn('[CadreService] exportAuthorityPrivateKey failed:', err);
      return null;
    }
  }

  /**
   * Not supported under cadre-core 0.8's single-key model.
   *
   * The authority key is derived from the node identity, and
   * `getSelfSigningKey()` refuses to sign with any key whose public half
   * doesn't match the control node's PeerId.  Installing a foreign authority
   * private key would therefore produce a node that believes it is an
   * authority but cannot sign anything.
   *
   * Recovering a cadre means restoring the *node identity* key (the value
   * `exportAuthorityPrivateKey()` returns) into the control store before the
   * node starts, or enrolling this device as a new peer of the existing
   * cadre via a seed.  See tmp/cadre-key-recovery-upstream.md.
   */
  async importAuthorityKey(_privateKeyB64u: string): Promise<{ publicKey: string }> {
    throw new Error(
      'Importing a standalone authority key is not supported: since cadre-core 0.8 the ' +
        'authority key is derived from this device\'s node identity. To recover a cadre, ' +
        'restore the node identity key, or enrol this device with a seed from an existing node.',
    );
  }

  /**
   * Generate a base64url-encoded seed for transporting cadre membership to a
   * new node (typically a drone via cadre-cli).  Requires authority genesis.
   */
  async createDroneSeed(): Promise<string> {
    await this.ensureStarted();
    if (!this.node) throw new Error('CadreNode not running');
    if (!this._authorityPublicKey) {
      throw new Error('No authority key — call createAuthorityKey() first');
    }
    const seed = await this.node.createSeed();
    return this.node.encodeSeed(seed);
  }

  /**
   * Join an existing cadre from a base64url seed produced by another node
   * (typically a drone/server via cadre-cli).  This is the INBOUND enrolment
   * path: decode the seed, dial the peers it advertises, and add them to the
   * control network.  Once at least one peer is connected the control network
   * has a cohort, so control-DB reads (authority genesis, strand attach) stop
   * blocking and normal operation resumes.
   *
   * Trust: a cold-start node's default policy (`dbAnchoredTrustPolicy`) rejects
   * every seed because its `AuthorityKey` table is empty.  We pin the seed's
   * OWN `signerKey`, so the node trusts the authority whose seed the user is
   * explicitly pasting.  This is deliberate trust-on-paste — the security
   * boundary is the user choosing to enter this specific seed.
   *
   * Mirrors `applySeed` in sereus reference-app-rn/src/use-cadre.ts.
   */
  async applySeedFromCode(encoded: string): Promise<{ peersAdded: number }> {
    await this.ensureStarted();
    if (!this.node) throw new Error('CadreNode not running');

    let seed;
    try {
      seed = this.node.decodeSeed(encoded.trim());
    } catch {
      throw new Error('Invalid seed: not a base64url-encoded cadre seed.');
    }

    const result = await this.node.applySeed(seed, {
      trustPolicy: pinnedKeyTrustPolicy([seed.signerKey]),
    });
    if (!result.success) {
      throw new Error(result.error ?? 'Seed could not be applied.');
    }

    console.info(
      `[CadreService] ✓ applied seed for party ${seed.partyId} — ${result.peersAdded} peer(s) added`,
    );
    return { peersAdded: result.peersAdded };
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
          // webSockets — dial a drone/relay over `wss`.
          // circuitRelayTransport — request a `/p2p-circuit` reservation on that
          //   relay so this non-listening phone gets a DIALABLE address
          //   (`getMultiaddrs()` becomes non-empty), which is what unblocks
          //   self-registration and invitations.  Passive until we dial a relay.
          // webRTC (relayed→direct hole-punch) is added in a follow-up — it needs
          //   the native `react-native-webrtc` module and is only used
          //   phone↔phone, not for reaching a drone.
          // `circuitRelayTransport()` is cast to bridge a nominal brand skew:
          // chat's `@libp2p/circuit-relay-v2` resolves a slightly different
          // `Components`/`@libp2p/interface` identity than db-p2p's transport-
          // factory element type.  Runtime-safe — libp2p matches transports by
          // the global `transportSymbol`, not by structural type.  Same bridge
          // the reference app uses for `webRTC()`.
          transports: [
            webSockets(),
            circuitRelayTransport() as unknown as ReturnType<typeof webSockets>,
          ],
          // RN cannot listen for inbound connections.
          listenAddrs: [],
        },
        // cadre-core verifies the sApp schema signature fail-closed.  Our sApp
        // config carries `signature: ''` and its `id` is a name
        // (`org.sereus.chat`) rather than an ed25519 author public key, so it
        // cannot be verified — every addStrand() would throw
        // SchemaVerificationError.  The reference app relaxes the policy for
        // exactly this reason.  Flip this back on once the schema is signed.
        //
        // trustedOwners / bootstrapPeers are omitted → cadre-core defaults them
        // to in-memory stores (fine for a session; not persisted across restart,
        // unlike the reference's Persistent*Store — chat uses the `privateKey`
        // identity path, so there is no expo-secure-store slot to hang them off).
        requireSignedSchemas: false,
      };

      console.info('[CadreService] creating CadreNode...');
      this.node = new CadreNode(config);
      console.info('[CadreService] starting CadreNode...');
      await this.node.start();
      console.info(
        '[CadreService] ✓ CadreNode running. Peer ID:',
        this.node.peerId?.toString(),
      );

      // Owner genesis + formation responder, INLINE (reference-app-rn pattern).
      //
      // At cadre-core 0.10 / optimystic 0.22 the solo (cadre-of-one) control
      // path completes in milliseconds (`control-database-solo.spec.ts`), so —
      // unlike the 0.8 stack chat previously ran, where a solo control-DB read
      // blocked forever and forced these off the boot path — we await genesis
      // here, fail-soft.  A generous diagnostic timeout keeps a regression from
      // silently wedging boot: if genesis ever fails to settle we log it and the
      // node still comes up (seed/invite flows just stay un-armed).  This inline
      // await is exactly chat's independent test of whether phone genesis works
      // on-device at 0.10.
      try {
        await withTimeout(this.runOwnerGenesis(), OWNER_GENESIS_TIMEOUT_MS, 'owner genesis');
      } catch (err) {
        console.warn(
          '[CadreService] owner genesis did not complete:',
          err instanceof Error ? err.message : err,
        );
      }

      // Formation responder — a SECURITY GATE: createOpenInvitation/formStrand
      // lazily spin up a solicitation service with NO usage recorder otherwise,
      // which accepts every token.  Synchronous (no control-DB read).
      try {
        this.initializeFormationResponder();
      } catch (err) {
        console.warn('[CadreService] formation responder init failed:', err);
      }
    } catch (err) {
      this._startError = err instanceof Error ? err.message : String(err);
      console.error('[CadreService] doStart failed:', this._startError);
      throw err;
    }
  }

  /**
   * Install the strand-formation responder, backed by the control DB's
   * `FormationInvite` / `FormationUsage` tables.  Without this, an invitation
   * token is never actually checked.  Synchronous — `initializeStrandSolicitation`
   * only constructs + registers a responder; it performs no control-DB read.
   */
  private initializeFormationResponder(): void {
    if (!this.node) throw new Error('CadreNode not running');
    const controlDb = this.node.getControlDatabase();
    if (!controlDb) throw new Error('Control database not available');

    this.node.initializeStrandSolicitation({
      formationUsageRecorder: new ControlFormationUsageRecorder(controlDb),
    });
    console.info('[CadreService] ✓ formation responder installed (token validity enforced)');
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
