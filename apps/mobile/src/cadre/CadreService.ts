/**
 * CadreService — the app's one cadre node, built by the Sereus kit.
 *
 * The node is `@serfab/cadre-rn`'s phone node (`createPhoneNode`): identity in the
 * keychain, the node-local stores durable and party-scoped, LevelDB storage per scope,
 * owner genesis, and the last start (party id, relays, Noise mode) remembered. This file
 * keeps the interface the rest of the app has always called, over that node, so the
 * kit could be adopted without touching the data layer (docs/STATUS.md, Phase 2a). In
 * the app-family structure it becomes the app's host (`apps/mobile/src/host/`).
 *
 * What chat adds over the kit's defaults, all in `configure` below: its strand filter,
 * unsigned schemas, and the strand-reactivity switch.
 *
 * References:
 *   sereus/packages/cadre-rn/src/phone-node (the kit)
 *   sereus/packages/reference-app-rn/src/cadre-phone.ts (its worked example)
 */

import {
  pinnedKeyTrustPolicy,
  type CadreNode,
  type CadreNodeEvents,
  type ControlDatabase,
  type RelayReservationState,
  type StrandInstance,
} from '@serfab/cadre-core';
import {
  createPhoneNode,
  runOwnerGenesis,
  type PhoneNodeOptions,
  type PhoneNodeStatus,
} from '@serfab/cadre-rn/phone-node';
// NATIVE NOISE CRYPTO — the kit's: `react-native-quick-crypto` for Noise's per-frame
// primitives. Metro resolves libp2p-noise's browser build, whose crypto is pure JS; on
// Hermes that saturates the loop long enough for libp2p's connection monitor to tear
// down its own connections (gotchoices/sereus#13). The kit hands it to the control node
// and every strand node.
import {
  buildNoiseCrypto,
  DEFAULT_NOISE_CRYPTO_MODE,
  type NoiseCryptoMode,
} from '@serfab/cadre-rn/noise-crypto';
import { createBackgroundRunner, phoneNodeLifecycle } from '@serfab/cadre-rn/lifecycle';
import { LevelDB, LevelDBWriteBatch } from 'rn-leveldb';
import { AppState } from 'react-native';

import { keychainSecureStore } from './keychain';
// TODO(extraction): the one chat-aware import; becomes host configuration in Phase 5.
import { CHAT_SAPP_ID } from '../data/chat-sapp';
import { DATA_FORMAT } from '../data/data-format';
import { NODE_STORAGE_NAMES } from '../data/persisted-names';
import { OWNER_GENESIS_TIMEOUT_MS } from './async';
import { STRAND_REACTIVITY } from '../data/config';

type EventHandler<T> = (payload: T) => void;

/**
 * The app's phone node. One per app: the kit refuses a second over the same storage.
 */
const phone = createPhoneNode({
  secureStore: keychainSecureStore,
  leveldb: {
    openFn: (name, createIfMissing, errorIfExists) => new LevelDB(name, createIfMissing, errorIfExists),
    WriteBatch: LevelDBWriteBatch,
  },
  names: NODE_STORAGE_NAMES,
  dataVersion: DATA_FORMAT,
  noiseCrypto: { build: buildNoiseCrypto, defaultMode: DEFAULT_NOISE_CRYPTO_MODE },
  // Chat's bound, as before the kit (the kit's default is 60 s).
  ownerGenesisTimeoutMs: OWNER_GENESIS_TIMEOUT_MS,
  // Transports and the connection gater are the kit's defaults, which are what chat
  // built by hand: WebSockets plus circuit relay, no listening, and dialing allowed to
  // private and plain-`ws` addresses (an emulator's 10.0.2.2, a relay on the house
  // Wi-Fi). The pinned `/p2p/<peerId>` decides which machine answers, not the gater.
  configure: config => ({
    ...config,
    // Only strands tagged with our sApp. The kit admits every strand the control
    // network lists.
    strandFilter: { mode: 'sAppId', sAppId: CHAT_SAPP_ID },
    // Our sApp config carries `signature: ''` and its `id` is a name, not an author
    // key, so it cannot be verified and fail-closed checking would refuse every
    // strand. Turn back on once the schema is signed.
    requireSignedSchemas: false,
    // Change notification for strand tables (sereus 1.12). See STRAND_REACTIVITY.
    ...(STRAND_REACTIVITY ? { strandReactivity: { enabled: true } } : {}),
  }),
});

/**
 * The kit's lifecycle runner (Phase 2c). When the app goes to the background it
 * hibernates every non-realtime strand (`hibernateAll`) and keeps the control node up for
 * as long as the OS allows; on the way back it restarts the node from its saved start if
 * the process lost it, and waits (bounded) for the control network to reconnect.
 * Started once, after the first successful start: it assumes a node exists.
 */
const runner = createBackgroundRunner({ ...phoneNodeLifecycle(phone), appState: AppState });
runner.onStateChange(state => {
  console.info(
    `[CadreService] lifecycle: ${state}${runner.resuming ? ' (resuming)' : ''}${runner.degraded ? ' (degraded)' : ''}`,
  );
  if (state === 'foreground' && !runner.resuming) void wakeHibernatedStrands();
});

/**
 * Wake every strand the runner hibernated. The kit wakes a hibernated strand only on a
 * push (`serviceWake`), so on a plain return to the app every conversation would stay
 * down — measured: the first send after returning failed with "database not available
 * (status: hibernating)". One at a time, to keep a phone's return from rebuilding every
 * strand network at once. Waking rebuilds the strand's database; `watchStrand`
 * re-attaches to it on `strand:waking`. Idempotent: only hibernating strands are touched.
 */
async function wakeHibernatedStrands(): Promise<void> {
  const node = phone.node;
  if (!node) return;
  for (const [strandId, instance] of node.getStrands()) {
    if (instance.status !== 'hibernating') continue;
    await wakeStrand(strandId).catch(() => { /* logged in wakeStrand */ });
  }
}

/** Wakes in flight, so a send waiting on a strand joins the sweep's wake of it. */
const wakes = new Map<string, Promise<void>>();

function wakeStrand(strandId: string): Promise<void> {
  const inFlight = wakes.get(strandId);
  if (inFlight) return inFlight;
  const node = phone.node;
  if (!node) return Promise.resolve();
  const t0 = Date.now();
  const wake = node.wakeStrand(strandId).then(
    () => console.info(`[CadreService] woke strand ${strandId.slice(0, 8)} in ${Date.now() - t0}ms`),
    (err: unknown) => {
      console.warn(`[CadreService] waking strand ${strandId.slice(0, 8)} failed:`, err);
      throw err;
    },
  ).finally(() => wakes.delete(strandId));
  wakes.set(strandId, wake);
  return wake;
}

class CadreServiceImpl {
  /**
   * The options the node last started with, or will start with: loaded from the kit's
   * saved start on first use, then whatever the last start used. Kept here as well as
   * on the kit, which reports options only while running, so relays and the party id
   * stay known while the node is stopped (a diagnostic stops it; a rebuild passes
   * through stopped).
   */
  private options: PhoneNodeOptions | null = null;
  /** Relays chosen while the node is not running; the next start uses them. */
  private pendingRelays: string[] | null = null;
  /** Noise mode chosen while the node is not running; the next start uses it. */
  private pendingNoiseMode: NoiseCryptoMode | null = null;
  private _startError: string | null = null;
  private _startPromise: Promise<void> | null = null;
  /** Owner genesis that succeeded through `createAuthorityKey` after a start that did not enroll. */
  private enrolledLate = false;

  /** `on()` registrations, so `off()` can find the kit's unsubscribe for a handler. */
  private readonly subscriptions: Array<{ event: string; handler: unknown; unsubscribe: () => void }> = [];
  /** Callbacks run after a rebuild-driven restart — see `onRebuilt`. */
  private readonly rebuildHooks: Array<() => void | Promise<void>> = [];
  /** The address set most recently observed. See `watchReachability`. */
  private lastSeenAddrs: string[] = [];
  private reachabilityListener: (() => void) | null = null;

  constructor() {
    phone.onStatus(status => this.onStatus(status));
  }

  get isRunning(): boolean {
    return phone.node?.isRunning ?? false;
  }

  get partyId(): string | null {
    return phone.options?.partyId ?? this.options?.partyId ?? null;
  }

  get peerId(): string | undefined {
    return phone.node?.peerId?.toString();
  }

  get startError(): string | null {
    return this._startError;
  }

  get cadreNode(): CadreNode | null {
    return phone.node;
  }

  get controlDatabase(): ControlDatabase | null {
    return phone.node?.getControlDatabase() ?? null;
  }

  /** Live snapshot of strand instances managed by this node. */
  getStrands(): Map<string, StrandInstance> {
    return phone.node?.getStrands() ?? new Map();
  }

  /**
   * Make sure a strand is awake before it is used. A strand hibernated while the app
   * was in the background has no database until it is rebuilt, which takes 15–20 s on
   * a phone; a send made in that window would fail with "status: hibernating". This
   * waits for the wake instead, joining the foreground sweep's wake if one is running.
   * Resolves at once for a strand that is not hibernating or waking.
   */
  async ensureAwake(strandId: string): Promise<void> {
    const instance = phone.node?.getStrands().get(strandId);
    if (!instance) return;
    if (wakes.has(strandId) || instance.status === 'hibernating') await wakeStrand(strandId);
  }

  /** Look up a single strand by id (null if not attached). */
  getStrand(strandId: string): StrandInstance | null {
    return phone.node?.getStrands().get(strandId) ?? null;
  }

  // -----------------------------------------------------------------------
  // Authority key + seed flows
  // -----------------------------------------------------------------------

  /** True iff owner genesis has run and seed flows are armed. */
  get hasAuthorityKey(): boolean {
    const status = phone.status;
    return status.state === 'running' && (status.owner === 'enrolled' || this.enrolledLate);
  }

  /** The authority public key (base64url) — the node identity's owner key, once enrolled. */
  get authorityPublicKey(): string | null {
    return this.hasAuthorityKey ? phone.ownerPublicKey() : null;
  }

  /**
   * The "create authority key" UI affordance. There is nothing to create — the
   * cadre's owner key IS the node identity — so this runs owner genesis again if the
   * start's own genesis did not enroll (it is idempotent), and reports the outcome.
   */
  async createAuthorityKey(): Promise<{ publicKey: string }> {
    await this.ensureStarted();
    const node = phone.node;
    if (!node) throw new Error('CadreNode not running');
    if (!this.hasAuthorityKey) {
      const result = await runOwnerGenesis(node, OWNER_GENESIS_TIMEOUT_MS);
      if (result !== 'enrolled') throw new Error(`Owner genesis ${result === 'timed-out' ? 'timed out' : 'failed'}`);
      this.enrolledLate = true;
    }
    const publicKey = phone.ownerPublicKey();
    if (!publicKey) throw new Error('Owner key unavailable');
    return { publicKey };
  }

  /**
   * Reveal the authority private key for offline backup. Use only from explicit
   * user-confirmed UI ("Export key for recovery") — never log it. Because authority ==
   * node identity, this IS the device's identity secret, held in the keychain.
   */
  async exportAuthorityPrivateKey(): Promise<string | null> {
    await this.ensureStarted();
    const node = phone.node;
    if (!node) return null;
    try {
      return node.getIdentityOwnerKey().privateKeyB64;
    } catch (err) {
      console.warn('[CadreService] exportAuthorityPrivateKey failed:', err);
      return null;
    }
  }

  /**
   * Not supported: the authority key is derived from the node identity, and the node
   * refuses to sign with any key whose public half does not match its PeerId.
   * Recovering a cadre means restoring the node identity, or enrolling this device as
   * a new peer of the existing cadre with a seed. See tmp/cadre-key-recovery-upstream.md.
   */
  async importAuthorityKey(_privateKeyB64u: string): Promise<{ publicKey: string }> {
    throw new Error(
      'Importing a standalone authority key is not supported: the authority key is derived from this ' +
        "device's node identity. To recover a cadre, restore the node identity key, or enrol this " +
        'device with a seed from an existing node.',
    );
  }

  /**
   * A base64url seed for bringing a new node (typically a drone, via cadre-cli) into
   * this cadre. Requires owner genesis.
   */
  async createDroneSeed(): Promise<string> {
    await this.ensureStarted();
    const node = phone.node;
    if (!node) throw new Error('CadreNode not running');
    if (!this.hasAuthorityKey) {
      throw new Error('No authority key — call createAuthorityKey() first');
    }
    const seed = await node.createSeed();
    return node.encodeSeed(seed);
  }

  /**
   * Join an existing cadre from a base64url seed produced by another node. Trust is
   * pinned to the seed's own `signerKey`: deliberate trust-on-paste, the boundary being
   * the user choosing to enter this specific seed. Mirrors `applySeed` in
   * reference-app-rn/src/use-cadre.ts.
   */
  async applySeedFromCode(encoded: string): Promise<{ peersAdded: number }> {
    await this.ensureStarted();
    const node = phone.node;
    if (!node) throw new Error('CadreNode not running');

    let seed;
    try {
      seed = node.decodeSeed(encoded.trim());
    } catch {
      throw new Error('Invalid seed: not a base64url-encoded cadre seed.');
    }
    const result = await node.applySeed(seed, {
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
   * Ensure the node is started. Idempotent — concurrent callers share the same
   * in-flight promise.
   */
  async ensureStarted(): Promise<void> {
    if (phone.node?.isRunning) return;
    if (this._startPromise) return this._startPromise;

    this._startPromise = this.doStart();
    try {
      await this._startPromise;
    } catch {
      throw new Error(this._startError ?? 'CadreService failed to start');
    } finally {
      this._startPromise = null;
    }
  }

  /**
   * Start with the options the node last ran with — the kit's saved start, so the
   * party id, relays and Noise mode survive a cold start — or, on first run, as a
   * fresh party. Relays or a Noise mode chosen while stopped override the saved ones.
   */
  private async doStart(): Promise<void> {
    this._startError = null;
    try {
      const base = await this.knownOptions();
      const options: PhoneNodeOptions = {
        ...base,
        relayAddrs: this.pendingRelays ?? base.relayAddrs,
        ...(this.pendingNoiseMode ? { noiseCryptoMode: this.pendingNoiseMode } : {}),
      };
      console.info('[CadreService] starting node for party', options.partyId);
      await phone.start(options);
      this.options = phone.options ?? options;
      runner.start(); // idempotent
      this.pendingRelays = null;
      this.pendingNoiseMode = null;
    } catch (err) {
      this._startError = err instanceof Error ? err.message : String(err);
      console.error('[CadreService] start failed:', this._startError);
      throw err;
    }
  }

  /** The last known options, loading the kit's saved start the first time. */
  private async knownOptions(): Promise<PhoneNodeOptions> {
    if (this.options) return this.options;
    const saved = await phone.loadSavedStart();
    if (saved) {
      this.options = saved.options;
    } else {
      this.options = { partyId: generateUuid(), bootstrapAddrs: [], relayAddrs: [] };
      console.info('[CadreService] first run: new party', this.options.partyId);
    }
    return this.options;
  }

  /** Rebuild the running node with changed options, then let the data layer catch up. */
  private async restartWith(change: Partial<PhoneNodeOptions>, why: string): Promise<void> {
    const current = phone.options ?? (await this.knownOptions());
    console.info(`[CadreService] ${why} — restarting node`);
    await phone.restart({ ...current, ...change });
    this.options = phone.options;
    await this.runRebuildHooks();
  }

  /**
   * Choose how much of Noise's crypto runs natively (`off`, `symmetric`, `full`).
   * Read when the node is BUILT, so changing it on a running node rebuilds it — no
   * identity change; the identity is reloaded from the keychain. Saved with the start.
   */
  async setNoiseCryptoMode(mode: NoiseCryptoMode): Promise<void> {
    if (mode === this.noiseCryptoMode) return;
    if (!phone.node?.isRunning) {
      this.pendingNoiseMode = mode;
      return;
    }
    await this.restartWith({ noiseCryptoMode: mode }, `noise crypto mode -> ${mode}`);
  }

  /** What the node is built with, or will be at the next start. */
  get noiseCryptoMode(): NoiseCryptoMode {
    return this.pendingNoiseMode
      ?? phone.options?.noiseCryptoMode
      ?? this.options?.noiseCryptoMode
      ?? DEFAULT_NOISE_CRYPTO_MODE;
  }

  /**
   * The relays this machine is configured with: those of the running node, or the
   * ones the next start will use. They live in the kit's saved start, not in prefs —
   * one copy of the setting.
   */
  async getRelayAddrs(): Promise<string[]> {
    if (this.pendingRelays) return [...this.pendingRelays];
    if (phone.options) return [...phone.options.relayAddrs];
    return [...(await this.knownOptions()).relayAddrs];
  }

  /**
   * Point this machine at `addrs` as its relays, and make that true of the running node.
   *
   * Relays are named when the node is BUILT (`network.relayAddrs`): that is what gives
   * a circuit listener to the control node AND to every strand node, and a strand node
   * is what holds a conversation's data. `CadreNode.reserveRelays()` reaches the
   * control node only. So changing relays on a RUNNING node rebuilds it: a few seconds
   * of reconnecting, the same identity, nothing on disk touched. Rare, and the
   * alternative presents as a successful join whose conversation never arrives.
   *
   * Idempotent and fail-soft: an unchanged set does nothing, and a relay that is down
   * leaves the node running and merely unreachable.
   */
  async applyRelays(addrs: string[]): Promise<void> {
    const next = [...addrs];
    const current = await this.getRelayAddrs();
    const unchanged = next.length === current.length && next.every((a, i) => a === current[i]);
    if (unchanged) return;

    // Pending until a node has started with them, so `getRelayAddrs` reports the new
    // set at once, including while a rebuild is under way.
    this.pendingRelays = next;
    if (!phone.node?.isRunning) return;
    try {
      await this.restartWith(
        { relayAddrs: next },
        `relays changed (${next.length}) so strand nodes get them`,
      );
    } finally {
      if (this.pendingRelays === next) this.pendingRelays = null;
    }
  }

  /**
   * The node's live reachability, recomputed on every call — a reservation can be
   * lost after it was granted, so this is read, never cached.
   */
  getRelayReservationState(): RelayReservationState | null {
    return phone.node?.getRelayReservationState() ?? null;
  }

  /** Stop the node gracefully. Idempotent. */
  async stop(): Promise<void> {
    await phone.stop();
    this._startPromise = null;
  }

  // -----------------------------------------------------------------------
  // Status and reachability
  // -----------------------------------------------------------------------

  private onStatus(status: PhoneNodeStatus): void {
    switch (status.state) {
      case 'running':
        console.info(
          `[CadreService] ✓ node running. Peer ID: ${status.node.peerId?.toString()} — owner genesis: ${status.owner}`,
        );
        this.watchReachability(status.node);
        break;
      case 'failed':
        this._startError = status.error.message;
        this.unwatchReachability();
        break;
      default:
        this.unwatchReachability();
    }
  }

  /** Stable comparison key for an address set; order from libp2p is not stable. */
  private static addrsKey(addrs: string[]): string {
    return [...addrs].sort().join('|');
  }

  /**
   * Log every change in this node's own addresses. A relay reservation being granted,
   * lost or moved shows up here (libp2p's `self:peer:update`), and it is the single
   * most useful signal we have about how the stack is doing on a phone. Address SETS
   * are compared, because the event also fires for changes that leave them unchanged.
   */
  private watchReachability(node: CadreNode): void {
    this.unwatchReachability();
    const controlNode = node.getControlNode();
    if (!controlNode) return;

    const onSelfUpdate = () => {
      if (!node.isRunning) return;
      const current = node.getMultiaddrs();
      if (CadreServiceImpl.addrsKey(current) === CadreServiceImpl.addrsKey(this.lastSeenAddrs)) return;
      const previous = this.lastSeenAddrs;
      this.lastSeenAddrs = current;
      console.info(`[CadreService] reachability ${previous.length} → ${current.length} address(es)`);
    };
    controlNode.addEventListener('self:peer:update', onSelfUpdate);
    this.reachabilityListener = () => controlNode.removeEventListener('self:peer:update', onSelfUpdate);
  }

  private unwatchReachability(): void {
    this.reachabilityListener?.();
    this.reachabilityListener = null;
    this.lastSeenAddrs = [];
  }

  // -----------------------------------------------------------------------
  // Events
  // -----------------------------------------------------------------------

  /**
   * Subscribe for the life of the app, not the life of one node. The kit re-attaches
   * every subscription to each node it builds, so a rebuild (relays, Noise mode) does
   * not silently drop `strand:discovered` — which once left a formed strand unattached
   * on the host while the joiner waited out its first-sync budget.
   */
  on<K extends keyof CadreNodeEvents>(event: K, handler: EventHandler<CadreNodeEvents[K]>): void {
    const unsubscribe = phone.on(event, handler);
    this.subscriptions.push({ event, handler, unsubscribe });
  }

  off<K extends keyof CadreNodeEvents>(event: K, handler: EventHandler<CadreNodeEvents[K]>): void {
    const i = this.subscriptions.findIndex(s => s.event === event && s.handler === handler);
    if (i < 0) return;
    this.subscriptions[i].unsubscribe();
    this.subscriptions.splice(i, 1);
  }

  /**
   * Run after a REBUILD-driven restart (not the first start), so the data layer can
   * re-read anything the old node was told while it was going away. The subscriptions
   * cover future events; this covers the window during the rebuild.
   */
  onRebuilt(cb: () => void | Promise<void>): void {
    this.rebuildHooks.push(cb);
  }

  private async runRebuildHooks(): Promise<void> {
    for (const cb of this.rebuildHooks) {
      try {
        await cb();
      } catch (err) {
        console.warn('[CadreService] rebuild hook failed:', err);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** UUID v4 from crypto.getRandomValues (polyfilled in index.js). */
function generateUuid(): string {
  const bytes = new Uint8Array(16);
  const c = (globalThis as { crypto?: { getRandomValues?: (buf: Uint8Array) => void } }).crypto;
  if (typeof c?.getRandomValues !== 'function') {
    throw new Error('crypto.getRandomValues is unavailable; cannot mint a party id');
  }
  c.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

export const cadreService = new CadreServiceImpl();
export default cadreService;
