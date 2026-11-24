/**
 * strands.ts — bringing a party's chat strands up and keeping them attached: the start-up
 * sweep, strands offered by the control network, remembered joins, self-registration
 * as a Member, and leaving.
 */
import { describeThrown } from '@serfab/cadre-core';
import type { CadreNode, StrandInstance, StrandRow } from '@serfab/cadre-core';
import type { ChatHost } from './host.js';
import { JoinedStrands, LocalRecords, SummaryCache, type JoinedStrand } from './local-state.js';
import { upsertMember } from './operations.js';
import { joinChatStrand } from './sapp-strands.js';
import { ChatFailure } from './errors.js';

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
  /**
   * ONE STRAND AT A TIME AT START-UP. Each strand is its own node; on the S7, starting 7–11
   * at once blocked the JavaScript thread for a minute, one timer 35–42 s late
   * (docs/STATUS.md, 2026-11-17). Attaches wait here and run in order: strands this device
   * has never listed first (a strand an invitation just made must run promptly), then the
   * most recently active, with a pause between.
   */
  private readonly queue = new Map<string, { attach: () => Promise<void>; done: () => void }>();
  private pumping = false;
  /** Runs a strand start under the model's busy signal (`strands.busy`); set by the model. */
  busyWhile: <T>(run: () => Promise<T>) => Promise<T> = run => run();
  /** Quiet strands left down at start-up; each attaches when it is opened (`attachDeferred`). */
  private readonly deferred = new Map<string, () => Promise<void>>();
  /**
   * A JOIN GOES FIRST. While one runs (`holdWhile`), the queue starts nothing; the strand being
   * joined is attached by the join itself, not from here. Opening an invitation from a cold
   * start used to race the wake of the recent strands: on the S7 formation finished only after
   * they all had (95–126 s to the conversation; the S21, 11 s). A strand already starting
   * finishes.
   */
  private holds = 0;
  private readonly waiters: Array<() => void> = [];

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
      this.bootFailure = describeThrown(err);
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
        void this.enqueue(strandId, () => this.attachDiscovered(strandId, strand));
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
      void this.enqueue(strandId, () => this.attachDiscovered(strandId, strandRow));
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
    await Promise.all(remembered.filter(row => !row.Left).map(row => this.enqueue(row.Id, () => this.attachRemembered(row))));
  }

  private async attachRemembered(row: JoinedStrand): Promise<void> {
    const node = this.node;
    if (!node) return;
    if (this.attaching.has(row.Id) || node.getStrands().has(row.Id)) return;
    this.attaching.add(row.Id);
    try {
      const instance = await joinChatStrand(node, row);
      await this.registerSelf(instance);
      console.info('[chat-strand] ✓ re-attached joined strand:', row.Id);
    } catch (err) {
      const message = describeThrown(err);
      const awaitingSync = err instanceof Error && err.name === 'StrandAwaitingFirstSyncError';
      console[awaitingSync ? 'info' : 'warn'](
        `[chat-strand] ${awaitingSync ? 'joined strand launched, awaiting first sync' : 'could not re-attach joined strand'}: ${row.Id} — ${message}`,
      );
    } finally {
      this.attaching.delete(row.Id);
    }
  }

  // ── The start-up queue ─────────────────────────────────────────────────────────

  /** Queue an attach; resolves once it ran (or was left for later, a quiet strand). */
  private enqueue(strandId: string, attach: () => Promise<void>): Promise<void> {
    const node = this.node;
    if (node?.getStrands().has(strandId) || this.attaching.has(strandId)) {
      if (this.host.dev) console.info(`[start-queue] ${strandId.slice(0, 8)} already ${this.attaching.has(strandId) ? 'attaching' : node?.getStrands().get(strandId)?.status}`);
      return Promise.resolve();
    }
    if (this.deferred.has(strandId)) { this.deferred.set(strandId, attach); return Promise.resolve(); }
    const queued = this.queue.get(strandId);
    return new Promise<void>(resolve => {
      const done = queued ? () => { queued.done(); resolve(); } : resolve;
      this.queue.set(strandId, { attach, done });
      void this.pump();
    });
  }

  private async pump(): Promise<void> {
    if (this.pumping) return;
    this.pumping = true;
    try {
      let ran = 0;
      while (this.queue.size) {
        if (this.holds) {
          if (this.host.dev) console.info(`[start-queue] held for a join (${this.queue.size} waiting)`);
          await new Promise<void>(r => this.waiters.push(r));
          continue;
        }
        const cached = await this.summaries.read();
        const lastAt = (id: string) => Date.parse(cached[id]?.lastMessage?.timestamp ?? '') || 0;
        // Recent: the most recently active few, and anything active lately.
        const known = Object.keys(cached);
        const policy = this.host.strandStart;
        const recent = new Set([...known].sort((x, y) => lastAt(y) - lastAt(x))
          .filter((id, i) => !policy || i < policy.recentCount || Date.now() - lastAt(id) < policy.recentMs));
        const [strandId, entry] = [...this.queue].sort(([x], [y]) =>
          (cached[x] ? 1 : 0) - (cached[y] ? 1 : 0) || lastAt(y) - lastAt(x))[0];
        this.queue.delete(strandId);
        if (cached[strandId] && !recent.has(strandId)) {
          // Quiet: left down until opened. Listed as asleep, from the last list shown.
          this.deferred.set(strandId, entry.attach);
          if (this.host.dev) console.info(`[start-queue] ${strandId.slice(0, 8)} left asleep (quiet)`);
          entry.done();
          continue;
        }
        if (ran++ > 0 && policy?.gapMs) await new Promise<void>(r => setTimeout(() => r(), policy.gapMs));
        const t0 = Date.now();
        if (this.host.dev) console.info(`[start-queue] ${strandId.slice(0, 8)} starting (${this.queue.size} waiting${cached[strandId] ? '' : ', never listed'})`);
        try { await this.busyWhile(() => entry.attach()); } finally { entry.done(); }
        if (this.host.dev) console.info(`[start-queue] ${strandId.slice(0, 8)} done in ${Date.now() - t0} ms`);
      }
    } finally {
      this.pumping = false;
      if (this.queue.size) void this.pump();
    }
  }

  /**
   * Run a join with the queue held. Held at most `maxMs`: a join still waiting on its first
   * sync then no longer keeps the rest down.
   */
  async holdWhile<T>(run: () => Promise<T>, maxMs = 60_000): Promise<T> {
    this.holds++;
    let held = true;
    const release = () => {
      if (!held) return;
      held = false;
      if (--this.holds === 0) this.kick();
    };
    const timer = setTimeout(release, maxMs);
    try {
      return await run();
    } finally {
      clearTimeout(timer);
      release();
    }
  }

  /** Wake the pump waiting on a hold. */
  private kick(): void {
    for (const r of this.waiters.splice(0)) r();
  }

  /** Strands left down at start-up, not yet opened. */
  deferredIds(): string[] {
    return [...this.deferred.keys()];
  }

  /** Still bringing strands up at start-up. */
  starting(): boolean {
    return this.pumping || this.queue.size > 0;
  }

  /** Left down at start-up as quiet. */
  isDeferred(strandId: string): boolean {
    return this.deferred.has(strandId);
  }

  /** Attach a strand left down at start-up, now that it is wanted. False if it was not. */
  async attachDeferred(strandId: string): Promise<boolean> {
    const attach = this.deferred.get(strandId);
    if (!attach) return false;
    this.deferred.delete(strandId);
    await attach();
    return true;
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
  async leave(strandId: string, opts: { keepIdentity: boolean; discardUnsent?: boolean }): Promise<{ purged: boolean }> {
    await this.ensureUp();
    const node = this.node;
    if (!node) throw new Error('Cadre is not running.');
    // Writes saved here and not yet sent (offline mode) were acknowledged to the user, so
    // the stack refuses the leave rather than drop them silently. Ask first; then
    // `discardUnsent` withdraws them. Checked before anything stops, since a stopped
    // strand's queue is read only from what it last listed.
    const unsent = node.getStrands().get(strandId)?.database?.offline?.queueState().depth ?? 0;
    if (unsent > 0 && !opts.discardUnsent) {
      throw new ChatFailure('unsent-messages', `${unsent} message${unsent === 1 ? '' : 's'} here not sent yet.`,
        { retryable: false });
    }
    const leaveOptions = opts.discardUnsent ? { discardQueued: true } : undefined;
    const list = await this.joined.read();
    if (list.some(s => s.Id === strandId)) {
      // JOINED from another party: its record is the party-wide `JoinedStrand` row, which
      // `unpublishStrand` cannot remove (that only works on this party's own `Strand` rows),
      // so the strand was offered again after a restart. `forgetJoinedStrand` removes the
      // row (with a tombstone, so the party's other machines drop it too) and stops it here.
      await node.forgetJoinedStrand(strandId, leaveOptions);
    } else {
      // FOUNDED here: remove this party's `Strand` row.
      try {
        await node.stopStrand(strandId);
      } catch (err) {
        console.warn('[chat-strand] stopStrand during leave:', strandId, err);
      }
      await node.unpublishStrand(strandId, leaveOptions);
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
