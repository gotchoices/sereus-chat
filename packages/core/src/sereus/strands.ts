/**
 * strands.ts — bringing a party's chat strands up and keeping them attached: the start-up
 * sweep, strands offered by the control network, remembered joins, self-registration
 * as a Member, and leaving.
 */
import type { CadreNode, StrandInstance, StrandRow } from '@serfab/cadre-core';
import type { ChatHost } from './host.js';
import { JoinedStrands, LocalRecords, SummaryCache, type JoinedStrand } from './local-state.js';
import { upsertMember } from './operations.js';
import { joinChatStrand } from './sapp-strands.js';

export class StrandRuntime {
  readonly joined: JoinedStrands;
  private readonly records: LocalRecords;
  private readonly summaries: SummaryCache;

  /** Collapses concurrent bring-up calls into one. */
  private bringUp: Promise<void> | null = null;
  /**
   * Has the node finished its first look for strands? Before, an empty list means
   * "not asked yet"; after, it is an answer — for a new user, the right one (story 01).
   * Set once, in a `finally`: we did ask, even if asking failed.
   */
  private swept = false;
  /**
   * Why start-up failed, so a failure can be TOLD APART from a slow start. Before this
   * every start-up fault rendered as the same endless "Looking for your strands…".
   */
  private bootFailure: string | null = null;
  /**
   * Strands whose Member row for this device is known to be in place this session,
   * with the name it carries. `send` registers before every message and a check costs
   * a read (about 3.4 s on the S7), so once per strand per session is enough.
   */
  private readonly registeredAs = new Map<string, string>();
  /**
   * Strands being attached. Load-bearing: the strand manager tracks an instance only
   * once `addStrand` has RESOLVED, so two overlapping attaches would both proceed.
   */
  private readonly attaching = new Set<string>();
  private discoveryWired = false;

  constructor(private readonly host: ChatHost) {
    this.joined = new JoinedStrands(host);
    this.records = new LocalRecords(host);
    this.summaries = new SummaryCache(host);
  }

  get node(): CadreNode | null {
    return this.host.node.node;
  }

  get peerId(): string | undefined {
    return this.node?.peerId?.toString();
  }

  hasSwept(): boolean {
    return this.swept;
  }

  bootError(): string | null {
    return this.bootFailure;
  }

  /** Bring the node up. Nothing is created: a new user has no strands (stories 01, 02). */
  async ensureUp(): Promise<void> {
    if (this.bringUp) return this.bringUp;
    this.bringUp = this.host.node.ensureStarted().finally(() => { this.bringUp = null; });
    return this.bringUp;
  }

  /**
   * Start-up, in this order:
   *   1. watch for offered strands, before anything else touches the node — the
   *      control network offers stored strands about 100 ms after start and never
   *      re-offers them;
   *   2. make sure the node is up;
   *   3. re-attach remembered joins — last, because it is the only step that dials
   *      other parties, and an unreachable host must not delay our own strands.
   * Idempotent; also the "try again" after a failed start.
   */
  async boot(): Promise<void> {
    await this.watchDiscovered();
    await this.ensureUp();
    await this.attachJoined();
  }

  // ── Self-registration ──────────────────────────────────────────────────────────

  /**
   * Idempotent self-registration as a Member of `strand` — every strand we attach, not
   * only one we founded: a joiner used to get no `App.Member` row at all. Failure is
   * logged, not thrown. Resolves true when the row is known to be in place.
   */
  async registerSelf(strand: StrandInstance): Promise<boolean> {
    const peerId = this.peerId;
    if (!peerId) return false;
    try {
      const name = await this.displayName(peerId);
      if (this.registeredAs.get(strand.strandId) === name) return true;
      await upsertMember(strand, peerId, name);
      this.registeredAs.set(strand.strandId, name);
      return true;
    } catch (err) {
      console.warn('[chat-strand] self-registration failed for', strand.strandId, err);
      return false;
    }
  }

  /** Push the profile name to `App.Member` in every attached strand (after a rename). */
  async syncProfileName(): Promise<void> {
    const node = this.node;
    const peerId = this.peerId;
    if (!node || !peerId) return;
    const name = await this.displayName(peerId);
    for (const strand of node.getStrands().values()) {
      if (!strand.database) continue;
      try {
        await upsertMember(strand, peerId, name);
        this.registeredAs.set(strand.strandId, name);
      } catch (err) {
        console.warn('[chat-strand] sync to strand', strand.strandId, 'failed:', err);
      }
    }
  }

  /** The profile name, or a truncated peer id until one is entered. */
  private async displayName(peerId: string): Promise<string> {
    const name = (await this.records.profile()).name?.trim();
    return name || peerId.slice(0, 12);
  }

  // ── Strands offered by the control network ─────────────────────────────────────

  /**
   * Attach every strand the control network offers that we are not already running.
   *
   * WHY THIS IS NOT OPTIONAL. When someone accepts our invitation, the formation
   * responder CREATES the strand on this machine's behalf and writes its row — but does
   * not launch it. Without this the host holds a strand it never runs, and the joiner
   * waits out `StrandAwaitingFirstSyncError`.
   *
   * ORDER MATTERS: subscribe FIRST, then drain `getDiscoveredStrands()`. The other way
   * round loses any strand offered between the two steps for the life of the process.
   * In this order a strand can be handled twice, so the handler is idempotent.
   */
  async watchDiscovered(): Promise<void> {
    try {
      await this.ensureUp();
    } catch (err) {
      // RECORD, then rethrow: the sweep flag must not stay false and the list claim
      // forever that it is still looking.
      this.bootFailure = err instanceof Error ? err.message : String(err);
      this.swept = true;
      throw err;
    }
    const node = this.node;
    if (!node) {
      this.bootFailure = 'the cadre node did not come up';
      this.swept = true;
      return;
    }
    this.bootFailure = null;

    if (!this.discoveryWired) {
      this.discoveryWired = true;
      // Subscribe first (the host keeps it across node restarts) …
      this.host.node.on('strand:discovered', ({ strandId, strand }) => {
        void this.attachDiscovered(strandId, strand);
      });
      // … and re-read the offers after a rebuild, for the window in which an offer went
      // to a node on its way out.
      this.host.node.onRebuilt(() => this.drainDiscovered());
    }
    // … then drain what was offered before we were listening.
    this.drainDiscovered();
    // We have ASKED, so "nothing here" is now honest; attaching is still in flight.
    this.swept = true;
  }

  private drainDiscovered(): void {
    const node = this.node;
    if (!node) return;
    for (const [strandId, strandRow] of node.getDiscoveredStrands()) {
      void this.attachDiscovered(strandId, strandRow);
    }
  }

  private async attachDiscovered(strandId: string, strandRow: StrandRow): Promise<void> {
    const node = this.node;
    if (!node) return;
    if (this.attaching.has(strandId) || node.getStrands().has(strandId)) return;
    this.attaching.add(strandId);
    try {
      // `deriveFounder`: a row from the CONTROL NETWORK carries a real founder key, and a
      // strand THIS device founded comes back this way after a restart.
      const instance = await joinChatStrand(node, strandRow, { deriveFounder: true });
      // Here too: a founded strand gets its self Member row here after a restart.
      await this.registerSelf(instance);
      console.info('[chat-strand] ✓ attached discovered strand:', strandId);
    } catch (err) {
      // Best-effort: it is re-offered later, and one failure must not stop the others.
      console.warn('[chat-strand] attach of discovered strand failed:', strandId, err);
    } finally {
      this.attaching.delete(strandId);
    }
  }

  // ── Remembered joins ───────────────────────────────────────────────────────────

  /**
   * Re-attach every remembered strand. Per-strand failures are non-fatal, and
   * `StrandAwaitingFirstSyncError` means the strand IS launched and still trying.
   */
  async attachJoined(): Promise<void> {
    const remembered = await this.joined.read();
    if (!remembered.length) return;
    await this.ensureUp();
    const node = this.node;
    if (!node) return;
    for (const row of remembered) {
      if (row.Left) continue; // left on purpose; kept only for its membership key
      if (this.attaching.has(row.Id) || node.getStrands().has(row.Id)) continue;
      this.attaching.add(row.Id);
      try {
        const instance = await joinChatStrand(node, row);
        await this.registerSelf(instance);
        console.info('[chat-strand] ✓ re-attached joined strand:', row.Id);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const awaitingSync = err instanceof Error && err.name === 'StrandAwaitingFirstSyncError';
        console[awaitingSync ? 'info' : 'warn'](
          `[chat-strand] ${awaitingSync ? 'joined strand launched, awaiting first sync' : 'could not re-attach joined strand'}: ${row.Id} — ${message}`,
        );
      } finally {
        this.attaching.delete(row.Id);
      }
    }
  }

  /**
   * Attach a strand, and keep waiting if the first sync has not finished.
   * `StrandAwaitingFirstSyncError` is NOT a failure — the strand stays launched and
   * keeps trying. Measured on a 1.8 s-round-trip link, the first sync landed at ~150 s
   * against a 120 s budget, so the budget is a progress report, not an outcome.
   */
  async attachAndAwaitWritable(
    node: CadreNode,
    row: JoinedStrand | StrandRow,
    opts: { deriveFounder?: boolean; patienceMs?: number } = {},
  ): Promise<StrandInstance> {
    try {
      return await joinChatStrand(node, row, opts);
    } catch (err) {
      if (!(err instanceof Error) || err.name !== 'StrandAwaitingFirstSyncError') throw err;
      const patienceMs = opts.patienceMs ?? 240_000;
      console.info(
        `[chat-strand] first sync still arriving for ${row.Id}; waiting up to ${patienceMs / 1000}s for strand:writable`,
      );
      return await node.whenStrandWritable(row.Id, { timeoutMs: patienceMs });
    }
  }

  // ── Leaving ────────────────────────────────────────────────────────────────────

  /**
   * Stop taking part in a strand on this party (story 33).
   *
   * `stopStrand` stops the instance for THIS SESSION only; `unpublishStrand` removes the
   * party's control row, which is what keeps it gone. It removes nothing from anyone
   * else. It does NOT erase the local copy — cadre-core has no purge step — so "forget"
   * drops the membership key while the blocks stay on disk.
   */
  async leave(strandId: string, opts: { keepIdentity: boolean }): Promise<{ purged: boolean }> {
    await this.ensureUp();
    const node = this.node;
    if (!node) throw new Error('Cadre is not running.');
    const list = await this.joined.read();
    if (list.some(s => s.Id === strandId)) {
      // JOINED from another party: its record is the party-wide `JoinedStrand` row, which
      // `unpublishStrand` cannot remove (that only works on this party's own `Strand` rows),
      // so the strand was offered again after a restart. `forgetJoinedStrand` removes the
      // row (with a tombstone, so the party's other machines drop it too) and stops it here.
      await node.forgetJoinedStrand(strandId);
    } else {
      // FOUNDED here: remove this party's `Strand` row.
      try {
        await node.stopStrand(strandId);
      } catch (err) {
        console.warn('[chat-strand] stopStrand during leave:', strandId, err);
      }
      await node.unpublishStrand(strandId);
    }
    await this.summaries.forget(strandId);
    // `keepIdentity` decides whether the membership key survives: kept, a later
    // invitation returns this user AS THEMSELVES.
    await this.joined.write(opts.keepIdentity
      ? list.map(s => (s.Id === strandId ? { ...s, Left: true } : s))
      : list.filter(s => s.Id !== strandId));
    console.info(`[chat-strand] left strand ${strandId} (identity ${opts.keepIdentity ? 'kept' : 'discarded'})`);
    return { purged: false };
  }
}
