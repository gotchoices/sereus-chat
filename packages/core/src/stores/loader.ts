/**
 * The loader store: one load state machine for every screen.
 *
 *   { state: 'loading' }                         nothing read yet
 *   { state: 'ready', value, error? }            read; `error` set when the LAST refresh
 *                                                failed and the value shown is the previous one
 *   { state: 'failed', error }                   the first read failed
 *
 * It reads when its first subscriber arrives, then again on each change signal it is
 * given — debounced, one read at a time, one more read if a change arrives during a
 * read — and on an optional backstop poll, for what no signal covers. It stops all of
 * that when its last subscriber leaves.
 */
import type { ChatError, Result } from '../model/index.js';
import { writable, type Readable } from './store.js';

export type LoadState<T> =
  | { state: 'loading'; value?: undefined; error?: undefined; refreshing: boolean }
  | { state: 'ready'; value: T; error?: ChatError; refreshing: boolean }
  | { state: 'failed'; value?: undefined; error: ChatError; refreshing: boolean };

export interface LoaderOptions<T> {
  load: () => Promise<Result<T>>;
  /** Subscribe to whatever should trigger a re-read; returns an unsubscribe. */
  changes?: (onChange: () => void) => () => void;
  /** Backstop poll, ms; a function is re-read after every load (settling vs settled). */
  pollMs?: number | (() => number | undefined);
  /** Coalesce a burst of change signals into one read. Default 500 ms. */
  debounceMs?: number;
}

export interface Loader<T> extends Readable<LoadState<T>> {
  /** Read now (coalesced with a read in flight). */
  reload(): void;
  /** Read now and resolve when that read has settled. */
  refresh(): Promise<void>;
}

export function loader<T>(opts: LoaderOptions<T>): Loader<T> {
  const debounceMs = opts.debounceMs ?? 500;
  let active = false;
  let inFlight: Promise<void> | null = null;
  let again = false;
  let debounce: unknown = null;
  let poll: unknown = null;
  let unsubscribeChanges: (() => void) | null = null;

  const store = writable<LoadState<T>>({ state: 'loading', refreshing: false }, () => {
    active = true;
    unsubscribeChanges = opts.changes?.(scheduleFromChange) ?? null;
    void run();
    return () => {
      active = false;
      unsubscribeChanges?.();
      unsubscribeChanges = null;
      if (debounce !== null) clearTimeout(debounce);
      if (poll !== null) clearTimeout(poll);
      debounce = poll = null;
    };
  });

  function scheduleFromChange() {
    if (!active || debounce !== null) return;
    debounce = setTimeout(() => { debounce = null; void run(); }, debounceMs);
  }

  function schedulePoll() {
    if (poll !== null) clearTimeout(poll);
    poll = null;
    const ms = typeof opts.pollMs === 'function' ? opts.pollMs() : opts.pollMs;
    if (active && ms) poll = setTimeout(() => { poll = null; void run(); }, ms);
  }

  function run(): Promise<void> {
    if (inFlight) { again = true; return inFlight; }
    store.update(s => (s.refreshing ? s : { ...s, refreshing: true }));
    inFlight = (async () => {
      let result: Result<T>;
      try {
        result = await opts.load();
      } catch (err) {
        // A model reports failures as Results; a throw is a defect, shown rather than lost.
        result = { ok: false, error: { kind: 'unexpected', retryable: false, message: err instanceof Error ? err.message : String(err), cause: err } };
      }
      store.update(s => {
        if (result.ok) return { state: 'ready', value: result.value, refreshing: false };
        if (s.state === 'ready') return { state: 'ready', value: s.value, error: result.error, refreshing: false };
        return { state: 'failed', error: result.error, refreshing: false };
      });
    })().finally(() => {
      inFlight = null;
      if (again && active) { again = false; void run(); }
      else { again = false; schedulePoll(); }
    });
    return inFlight;
  }

  return {
    subscribe: store.subscribe,
    get: store.get,
    reload: () => { void run(); },
    refresh: () => run(),
  };
}
