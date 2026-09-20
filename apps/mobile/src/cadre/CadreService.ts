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
  type RelayReservationState,
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
   * Relays this node is configured with, named at CONSTRUCTION.
   *
   * Set by `applyRelays` before start (App boot reads them from prefs). They go
   * into `network.relayAddrs`, which is the only way a relay reaches this
   * machine's STRAND nodes as well as its control node — see `applyRelays`.
   */
  private _relayAddrs: string[] = [];
  /**
   * The address set the formation responder was last installed with, and the
   * timer that notices when reality diverges from it. See `watchReachability`.
   */
  private _responderAddrs: string[] = [];
  private _reachabilityListener: (() => void) | null = null;

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
          // RN cannot listen for inbound connections, so no TCP entry — and no
          // hand-written `/p2p-circuit` either. Naming a relay in `relayAddrs`
          // ADDS the bare `/p2p-circuit` search listener for us, one per relay,
          // to both the control node and every strand node. An explicitly empty
          // list stays empty when no relay is configured, which is right: a
          // phone with no relay has no address and should not pretend to listen.
          listenAddrs: [],
          // THE RELAYS, NAMED AT CONSTRUCTION — not `reserveRelays()` afterwards.
          //
          // This used to be the other way round, to avoid `relayAddrs`' fail-fast
          // contract (a relay that is down aborting `start()`). That reasoning was
          // sound but the conclusion was wrong: `requireRelay: false` below softens
          // exactly that, and strand nodes are fail-soft over `relayAddrs`
          // regardless of it.
          //
          // The difference is not cosmetic. `reserveRelays()` supervises the
          // CONTROL node alone, while every strand runs as its own libp2p node with
          // its own transport peer id — so on the runtime path our strand nodes had
          // no circuit address at all. Formation still completed (the invitee dials
          // the control node first), the invitation was consumed, and then the
          // joiner sat in `StrandAwaitingFirstSyncError` because nothing holding
          // the strand's data was reachable. Success on one side, silence on the
          // other. `reference-app-rn/src/phone-node-config.ts` warns about this in
          // as many words.
          relayAddrs: this._relayAddrs,
          // Fail-soft: a relay that is down leaves the app usable and merely
          // unreachable, which is the honest failure and the posture the old
          // `reserveRelays()` call was really after.
          requireRelay: false,
          // libp2p's default gater refuses to dial private/loopback addresses
          // and insecure WebSockets — which covers an emulator's `10.0.2.2`, a
          // phone reaching a relay on the house wifi, and any relay not behind
          // TLS.  All three are cases chat means to support: "run your own on a
          // spare machine" is the outcome we steer people to.
          //
          // Dialing is not the security boundary here.  The user is dialing a
          // relay they chose, at an address they were shown, and the pinned
          // `/p2p/<peerId>` is what guarantees the machine that answers is the
          // one offered — the promise RelayOffer makes in as many words.  A
          // relay also never joins a strand or reads a message.
          connectionGater: { denyDialMultiaddr: () => false },
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
        this.watchReachability();
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
  /**
   * Point this machine at `addrs` as its relays, and make that true of the
   * running node.
   *
   * Relays are named when the node is BUILT (`network.relayAddrs`), because that
   * is what gives a circuit listener to the control node AND to every strand
   * node — and a strand node is what actually holds a conversation's data. There
   * is no runtime call that reaches strand nodes: `CadreNode.reserveRelays()`
   * supervises the control node only, by design (it exists for a browser tab
   * that learns its relay late).
   *
   * So changing the relay set on a RUNNING node means rebuilding the node. That
   * is a few seconds of reconnecting, and it is deliberate:
   *
   *   - It is not a new identity. The peer key lives in the control store and is
   *     reloaded on start, so this machine keeps the same peer id across the
   *     rebuild and remains the same party to everyone else. Nothing on disk is
   *     touched.
   *   - It is rare. Relays are chosen at setup and changed seldom; every launch
   *     afterwards reads them from prefs and names them at construction, with no
   *     restart involved.
   *   - The alternative is worse. Reserving at runtime makes the control node
   *     reachable and leaves the strand nodes unreachable, which presents as a
   *     successful join whose conversation never arrives.
   *
   * Idempotent and fail-soft: an unchanged set does nothing, and a relay that is
   * down leaves the node running and merely unreachable (`requireRelay: false`).
   */
  async applyRelays(addrs: string[]): Promise<void> {
    const next = [...addrs];
    const unchanged =
      next.length === this._relayAddrs.length &&
      next.every((a, i) => a === this._relayAddrs[i]);
    if (unchanged) return;

    this._relayAddrs = next;

    // Not running yet: `doStart` will read the new list. This is the common
    // case — App boot applies saved relays before the first start.
    if (!this.node?.isRunning) return;

    console.info(`[CadreService] relays changed (${next.length}) — restarting node so strand nodes get them`);
    await this.stop();
    this._startPromise = null;
    await this.ensureStarted();
  }

  /**
   * The node's live reachability, recomputed on every call from its current
   * multiaddrs — a reservation can be lost after it was granted (the relay
   * restarts, the connection drops), so this is read, never cached.
   */
  getRelayReservationState(): RelayReservationState | null {
    return this.cadreNode?.getRelayReservationState() ?? null;
  }

  /**
   * Install the strand-formation responder, backed by the control DB's
   * `FormationInvite` / `FormationUsage` tables. Without this, an invitation
   * token is never actually checked.
   *
   * Installed once, at startup, and that is now correct: `initializeStrandSolicitation`
   * snapshots the node's addresses (`cadrePeerAddrs: getMultiaddrs()`), and with
   * relays named in `network.relayAddrs` the circuit listener exists before this
   * runs. On the old `reserveRelays()` path it did not, so the responder advertised
   * an empty address list for the life of the process and every joiner rejected the
   * result — which is why this briefly grew a reinstall-on-reservation hook. The
   * config change removed the reason for it.
   */
  private initializeFormationResponder(): void {
    if (!this.node) throw new Error('CadreNode not running');
    const controlDb = this.node.getControlDatabase();
    if (!controlDb) throw new Error('Control database not available');

    // Drop the previous responder first. A fresh `StrandSolicitationService`
    // carries a fresh registration set, so it would call `node.handle()` for a
    // protocol the old one still holds — and libp2p throws on a duplicate.
    const previous = this.node.getStrandSolicitationService();
    const controlNode = this.node.getControlNode();
    if (previous && controlNode) {
      previous.unregisterResponder(controlNode);
    }

    this.node.initializeStrandSolicitation({
      formationUsageRecorder: new ControlFormationUsageRecorder(controlDb),
    });

    this._responderAddrs = this.node.getMultiaddrs();
    console.info(
      `[CadreService] ✓ formation responder installed — advertising ${this._responderAddrs.length} address(es)`,
    );
    if (this._responderAddrs.length === 0) {
      // Not fatal, and not permanent any more — `watchReachability` reinstalls
      // once an address appears. Said out loud because an invitation minted in
      // this state cannot be completed, and the joiner is the only side that
      // finds out.
      console.warn('[CadreService] responder has no addresses yet — joins will be rejected until a relay reservation lands');
    }
  }

  /** Stable comparison key for an address set; order from libp2p is not stable. */
  private static addrsKey(addrs: string[]): string {
    return [...addrs].sort().join('|');
  }

  /**
   * Keep the formation responder's advertised addresses honest.
   *
   * `initializeStrandSolicitation` takes `cadrePeerAddrs` as a SNAPSHOT —
   * `getMultiaddrs()`, evaluated once — while `resolveStrandAddrs` beside it is a
   * live hook. On a phone that asymmetry decides whether anyone can join us, and
   * naming relays in `network.relayAddrs` is not by itself enough to fix it:
   * `requireRelay: false` (which we want, so a dead relay leaves the app usable)
   * lets `start()` return before the first reservation has landed. A device slow
   * enough to lose that race — our 2016 test phone does, repeatedly — installs a
   * responder advertising NOTHING and, without this, keeps advertising nothing
   * for the life of the process even after the reservation succeeds seconds later.
   *
   * The failure that causes is thoroughly misleading: the joiner dials fine, the
   * responder approves, creates the strand and records the token as spent, and
   * only then does the joiner reject the result, because
   * `isValidResponderCreatesResult` requires a non-empty `cadrePeerAddrs`. It
   * reads as "Responder result failed validation" on the JOINER, with nothing
   * visibly wrong on the host, and it burns the invitation on the way through.
   *
   * EVENT-DRIVEN, not polled. libp2p dispatches `self:peer:update` whenever this
   * node's own peer record changes — "a transport started listening on a new
   * address" covers a circuit-relay reservation being granted, lost, or moved —
   * and cadre-core exposes the control node through `getControlNode()`, so the
   * signal is already there to subscribe to.
   *
   * The event also fires for changes we do not care about (registering a protocol
   * handler, for one — which reinstalling the responder itself does). Comparing
   * address SETS is what makes that safe: a handler registration leaves the set
   * identical, the comparison returns early, and the reinstall cannot re-trigger
   * itself.
   *
   * Reacting to any CHANGE, not merely empty → non-empty: a reservation that
   * lapses and is re-granted comes back on a different relay address, and a
   * responder still advertising the old one sends joiners somewhere that no
   * longer routes.
   */
  private watchReachability(): void {
    const node = this.node;
    const controlNode = node?.getControlNode();
    if (!node || !controlNode || this._reachabilityListener) return;

    const onSelfUpdate = () => {
      if (!this.node?.isRunning) return;

      const current = this.node.getMultiaddrs();
      if (CadreServiceImpl.addrsKey(current) === CadreServiceImpl.addrsKey(this._responderAddrs)) {
        return;
      }

      // ONLY when the responder currently has NOTHING to offer.
      //
      // Reinstalling means `unhandle()` then `handle()` on the formation
      // protocol, and that tears down streams in flight — a joiner mid-handshake
      // gets "Formation stream closed before length prefix" and its invitation is
      // spent. Relay reservations turn out to drop and recover routinely during a
      // formation (measured: a 4 → 0 → 4 cycle on whichever side is working), so
      // reacting to EVERY change meant we were reliably cutting the very
      // handshakes this was meant to enable.
      //
      // Empty → non-empty is the case that actually needed fixing: a responder
      // stuck advertising nothing rejects every joiner, forever, and has no
      // stream to lose. A responder that already has addresses stays as it is
      // even if they change; a stale address costs one failed dial, while a
      // mid-formation teardown costs the invitation.
      if (this._responderAddrs.length > 0) {
        return;
      }

      console.info(
        `[CadreService] reachability changed (${this._responderAddrs.length} → ${current.length} address(es)) — reinstalling formation responder`,
      );
      try {
        this.initializeFormationResponder();
      } catch (err) {
        // Best-effort: a failed reinstall leaves the PREVIOUS responder
        // unregistered, so record the failure loudly and clear the remembered set
        // so the next address change retries rather than comparing equal.
        console.warn('[CadreService] responder reinstall failed; will retry on the next address change:', err);
        this._responderAddrs = [];
      }
    };

    controlNode.addEventListener('self:peer:update', onSelfUpdate);
    this._reachabilityListener = () => controlNode.removeEventListener('self:peer:update', onSelfUpdate);
  }

  /** Stop the CadreNode gracefully.  Idempotent. */
  async stop(): Promise<void> {
    this._reachabilityListener?.();
    this._reachabilityListener = null;
    this._responderAddrs = [];
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
