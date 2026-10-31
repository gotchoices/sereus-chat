/**
 * delivery.ts — where each of this device's own writes stands, from saved here to held
 * by the other members, in both of the stack's modes:
 *
 * - **Online** (the CLI, NativeScript, a phone switched to synchronous): a write returns
 *   once its cohort takes it. Its durability report (`commitDurability(Tx)`) says whether
 *   another machine holds it, and `strand:commit-held` says when every member does.
 * - **Offline mode** (the RN app's default): a write returns once it is saved in the
 *   strand's journal here. The queue reports it `queued`, `submitting`, `committed` or
 *   `failed` (`strand:offline-status`), and a committed one then reports durability as an
 *   online one does.
 *
 * Sources: sereus `docs/strands.md` "A commit's durability" and "Offline mode";
 * `reference-app-rn.md` "Messages Not Yet Delivered", whose rules this follows.
 *
 * A write is known by the transaction id its statement returned (`StampId()`). The queue
 * reports a transaction only by that id, so this keeps the mapping to the record it wrote,
 * persisted (slot `outbox`), so a message still waiting after a restart is marked again.
 * Statuses are read right after the write returns, in the same step that records it: the
 * first `queued` status is delivered inside the commit, before the id is known, and a
 * status read then is current. Events that arrive before the record (a race on a fast
 * link) wait in a short buffer.
 *
 * Durability reports are held in memory by the stack: after a restart, or when nothing
 * follows a commit (`followed: false`), a committed write shows `unconfirmed`, never
 * stuck as pending. Refusals stay listed until the user dismisses them.
 */
import type { StrandInstance } from '@serfab/cadre-core';
import type { Deliveries, Delivery, Durability, Outbox, WriteFailure, WriteKind } from '../model/index.js';
import type { ChatHost } from './host.js';

/** What one tracked transaction wrote. */
export type WriteTarget = {
  kind: WriteKind;
  messageId?: string;
  /** For a reaction: its symbol (the record is the message's reaction by this device). */
  symbol?: string;
  preview?: string;
};

type Tracked = WriteTarget & {
  strandId: string;
  txId: string;
  at: string;
  state: Durability;
  mayFail?: boolean;
  discardable?: boolean;
};

type Persisted = Omit<Tracked, 'state' | 'mayFail' | 'discardable'> & { state?: Durability; reason?: string };

/** The parts of a queue status this reads (Optimystic's `QueuedTransactionStatus`). */
type QueueStatus = {
  kind: string;
  transactionId: string;
  inDoubt?: boolean;
  outlook?: { kind?: string };
  reason?: string;
};

type QueueState = { depth?: number; waitingFor?: string; readsServedLocally?: boolean };

/** How long a delivered write keeps its mark before the record is let go. */
const DELIVERED_KEEP_MS = 60_000;
/** Events for transactions not recorded yet: a few seconds' worth is plenty. */
const EARLY_EVENTS = 256;

export class DeliveryTracker {
  private readonly byTx = new Map<string, Tracked>();
  private readonly failures = new Map<string, WriteFailure & { strandId: string }>();
  private readonly queues = new Map<string, QueueState>();
  private readonly early = new Map<string, Array<(t: Tracked) => void>>();
  private readonly listeners = new Set<(strandId: string) => void>();
  private loaded: Promise<void> | null = null;
  private wired = false;

  constructor(private readonly host: ChatHost, private readonly strandOf: (strandId: string) => StrandInstance | undefined) {}

  private get slot() { return this.host.slot('outbox'); }

  /** A strand's marks changed: re-read its messages. */
  onChange(listener: (strandId: string) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  /** Subscribe to the node's events once; the host re-attaches them to every node it builds. */
  wire(): void {
    if (this.wired) return;
    this.wired = true;
    const on = this.host.node.on.bind(this.host.node);
    on('strand:offline-status', ({ strandId, status }) => this.onStatus(strandId, status as unknown as QueueStatus));
    on('strand:commit-durability', ({ strandId, transactionId, heldElsewhere, followed }) =>
      this.apply(transactionId, t => this.setState(t, committedState(heldElsewhere, followed)), strandId));
    on('strand:commit-held', ({ strandId, transactionId }) =>
      this.apply(transactionId, t => this.setState(t, 'delivered'), strandId));
    on('strand:queue-state', ({ strandId, state }) => {
      this.queues.set(strandId, state as unknown as QueueState);
      // Also the publication announcement: re-read what a restart restored.
      void this.refresh(strandId);
      this.emit(strandId);
    });
  }

  /** Load what an earlier run left waiting. */
  load(): Promise<void> {
    if (!this.loaded) {
      this.loaded = (async () => {
        let parsed: unknown;
        try { const text = await this.slot.load(); parsed = text ? JSON.parse(text) : undefined; } catch { parsed = undefined; }
        const rows = Array.isArray(parsed) ? (parsed as Persisted[]) : [];
        for (const r of rows) {
          if (!r?.txId || !r.strandId) continue;
          if (r.state === 'failed') {
            this.failures.set(r.txId, { id: r.txId, strandId: r.strandId, kind: r.kind, messageId: r.messageId,
              preview: r.preview, reason: r.reason ?? 'refused', at: r.at });
          } else if (!this.byTx.has(r.txId)) {
            this.byTx.set(r.txId, { ...r, state: 'waiting' });
          }
        }
      })();
    }
    return this.loaded;
  }

  /**
   * A write returned with this transaction id. Read where it stands now, and keep
   * following it. No id (an `insert or ignore` that ignored, an update that matched
   * nothing) means nothing was written: nothing to mark.
   */
  record(strandId: string, txId: string | undefined, target: WriteTarget): Delivery | undefined {
    if (!txId) return undefined;
    const t: Tracked = { ...target, strandId, txId, at: new Date().toISOString(), state: 'saving' };
    this.byTx.set(txId, t);
    this.readNow(t);
    for (const pending of this.early.get(txId) ?? []) pending(t);
    this.early.delete(txId);
    this.persist();
    this.emit(strandId);
    return this.delivery(t);
  }

  /** Where one tracked transaction stands, or undefined once it is no longer followed. */
  stateOf(txId: string): Durability | undefined {
    return this.byTx.get(txId)?.state ?? (this.failures.has(txId) ? 'failed' : undefined);
  }

  /** Every mark in a strand: each message's latest send or edit, each reaction's latest add. */
  deliveries(strandId: string): Deliveries {
    const latest = new Map<string, Tracked>();
    for (const t of this.byTx.values()) {
      if (t.strandId !== strandId || !t.messageId) continue;
      const key = t.kind === 'react' ? `r ${t.messageId} ${t.symbol}` : (t.kind === 'send' || t.kind === 'edit') ? `m ${t.messageId}` : undefined;
      if (!key) continue;
      const seen = latest.get(key);
      if (!seen || t.at >= seen.at) latest.set(key, t);
    }
    const messages: Record<string, Delivery> = {};
    const reactions: Record<string, Delivery> = {};
    for (const [key, t] of latest) {
      if (key.startsWith('m ')) messages[t.messageId!] = this.delivery(t);
      else reactions[`${t.messageId} ${t.symbol}`] = this.delivery(t);
    }
    return { messages, reactions, outbox: this.outbox(strandId) };
  }

  /** The mark for one of this device's messages: its latest send or edit. */
  messageDelivery(strandId: string, messageId: string): Delivery | undefined {
    let latest: Tracked | undefined;
    for (const t of this.byTx.values()) {
      if (t.strandId !== strandId || t.messageId !== messageId) continue;
      if (t.kind !== 'send' && t.kind !== 'edit') continue;
      if (!latest || t.at >= latest.at) latest = t;
    }
    return latest ? this.delivery(latest) : undefined;
  }

  /** The mark for this device's reaction `symbol` on a message. */
  reactionDelivery(strandId: string, messageId: string, symbol: string): Delivery | undefined {
    let latest: Tracked | undefined;
    for (const t of this.byTx.values()) {
      if (t.strandId === strandId && t.messageId === messageId && t.kind === 'react' && t.symbol === symbol
        && (!latest || t.at >= latest.at)) latest = t;
    }
    return latest ? this.delivery(latest) : undefined;
  }

  outbox(strandId: string): Outbox {
    const queue = this.queues.get(strandId);
    let waiting = 0;
    for (const t of this.byTx.values()) if (t.strandId === strandId && t.state === 'waiting') waiting++;
    return {
      waiting: Math.max(waiting, queue?.depth ?? 0),
      waitingForMembers: queue?.waitingFor === 'cohort',
      showingSavedCopy: queue?.readsServedLocally === true,
      failed: [...this.failures.values()].filter(f => f.strandId === strandId).map(({ strandId: _s, ...f }) => f),
    };
  }

  /** Stop showing a refusal, and let the queue forget its outcome. */
  dismiss(strandId: string, failureId: string): void {
    this.failures.delete(failureId);
    try { this.strandOf(strandId)?.database?.offline?.acknowledge(failureId); } catch { /* already gone */ }
    this.persist();
    this.emit(strandId);
  }

  /** The waiting write of a message, for `discard`. */
  waitingWriteOf(strandId: string, messageId: string): string | undefined {
    for (const t of this.byTx.values()) {
      if (t.strandId === strandId && t.messageId === messageId && t.state === 'waiting') return t.txId;
    }
    return undefined;
  }

  forgetStrand(strandId: string): void {
    for (const [tx, t] of this.byTx) if (t.strandId === strandId) this.byTx.delete(tx);
    for (const [id, f] of this.failures) if (f.strandId === strandId) this.failures.delete(id);
    this.queues.delete(strandId);
    this.persist();
  }

  // ── Internals ──────────────────────────────────────────────────────────────────

  private delivery(t: Tracked): Delivery {
    return {
      state: t.state,
      ...(t.state === 'waiting' && t.mayFail ? { mayFail: true } : {}),
      ...(t.state === 'waiting' && t.discardable ? { discardable: true } : {}),
    };
  }

  /** Where a write stands right now: the queue's status first (offline mode), else its durability. */
  private readNow(t: Tracked): void {
    const db = this.strandOf(t.strandId)?.database;
    if (!db) return;
    let status: QueueStatus | undefined;
    try { status = db.offline?.status(t.txId) as unknown as QueueStatus | undefined; } catch { status = undefined; }
    if (status) { this.applyStatus(t, status); return; }
    let durability: { heldElsewhere: boolean; followed: boolean } | undefined;
    try { durability = db.commitDurability(t.txId); } catch { durability = undefined; }
    if (durability) this.setState(t, committedState(durability.heldElsewhere, durability.followed));
    else this.setState(t, 'unconfirmed');
  }

  private onStatus(strandId: string, status: QueueStatus): void {
    this.apply(status.transactionId, t => this.applyStatus(t, status), strandId);
  }

  private applyStatus(t: Tracked, status: QueueStatus): void {
    switch (status.kind) {
      case 'queued':
        t.mayFail = status.outlook?.kind === 'exposed';
        t.discardable = status.inDoubt === false;
        this.setState(t, 'waiting');
        return;
      case 'outlook-changed':
        t.mayFail = status.outlook?.kind === 'exposed';
        return;
      case 'submitting':
      case 'partially-committed':
        this.setState(t, 'sending');
        return;
      case 'committed': {
        // `strand:commit-durability` came first and set it; read it again in case that was
        // before this write was recorded. Undefined after a restart: nothing follows it now.
        let d: { heldElsewhere: boolean; followed: boolean } | undefined;
        try { d = this.strandOf(t.strandId)?.database?.commitDurability(t.txId); } catch { d = undefined; }
        this.setState(t, d ? committedState(d.heldElsewhere, d.followed) : 'unconfirmed');
        return;
      }
      case 'failed':
        this.byTx.delete(t.txId);
        this.failures.set(t.txId, {
          id: t.txId, strandId: t.strandId, kind: t.kind, messageId: t.messageId, preview: t.preview,
          reason: status.reason ?? 'refused', at: new Date().toISOString(),
        });
        this.persist();
        this.emit(t.strandId);
        return;
    }
  }

  /** Forward only, except to `failed` (handled above). */
  private setState(t: Tracked, state: Durability): void {
    if (rank(state) < rank(t.state) && !(t.state === 'unconfirmed' && state === 'delivered')) return;
    if (t.state === state) return;
    t.state = state;
    if (state === 'delivered') {
      // Delivered is the normal case: show it briefly, then stop tracking.
      const timer: unknown = setTimeout(() => {
        if (this.byTx.get(t.txId)?.state === 'delivered') { this.byTx.delete(t.txId); this.persist(); }
      }, DELIVERED_KEEP_MS);
      // Node: never keep a process alive for a mark.
      (timer as { unref?: () => void }).unref?.();
    }
    this.persist();
    this.emit(t.strandId);
  }

  /** Run `fn` on the tracked write, or hold it until the write is recorded. */
  private apply(txId: string, fn: (t: Tracked) => void, strandId: string): void {
    const t = this.byTx.get(txId);
    if (t) { fn(t); return; }
    const pending = this.early.get(txId) ?? [];
    pending.push(fn);
    this.early.set(txId, pending);
    while (this.early.size > EARLY_EVENTS) this.early.delete(this.early.keys().next().value as string);
    void strandId;
  }

  /** Re-read every tracked write of a strand: after a restart, or once its database is published again. */
  async refresh(strandId: string): Promise<void> {
    await this.load();
    for (const t of [...this.byTx.values()]) if (t.strandId === strandId) this.readNow(t);
    this.emit(strandId);
  }

  private persist(): void {
    const rows: Persisted[] = [...this.byTx.values()]
      .filter(t => t.state === 'waiting' || t.state === 'sending')
      .map(({ mayFail: _m, discardable: _d, ...t }) => t);
    for (const f of this.failures.values()) {
      rows.push({ strandId: f.strandId, txId: f.id, kind: f.kind, messageId: f.messageId, preview: f.preview, at: f.at,
        state: 'failed', reason: f.reason });
    }
    void this.slot.save(JSON.stringify(rows)).catch(() => { /* marks are a convenience; the stack holds the writes */ });
  }

  private emit(strandId: string): void {
    for (const l of this.listeners) { try { l(strandId); } catch { /* a listener's fault */ } }
  }
}

function committedState(heldElsewhere: boolean, followed: boolean): Durability {
  return heldElsewhere ? 'delivered' : followed ? 'here' : 'unconfirmed';
}

const ORDER: Durability[] = ['saving', 'waiting', 'sending', 'here', 'unconfirmed', 'delivered', 'failed'];
function rank(state: Durability): number { return ORDER.indexOf(state); }
