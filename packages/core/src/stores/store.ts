/**
 * The store primitive every screen binds to (docs/app-family.md, "Stores").
 *
 * The Svelte store contract — `subscribe(fn)` calls `fn` at once with the current value
 * and returns an unsubscribe function — plus `get()`, and two rules:
 *
 * - `get()` returns the same object until the value changes. React's
 *   `useSyncExternalStore` re-renders whenever the snapshot is a new object, so a store
 *   that rebuilt its value on every read would loop. `set` with an identical value does
 *   nothing.
 * - Reference-counted: `start` runs when the first subscriber arrives and the function
 *   it returns runs when the last one leaves. Work a store does (reads, change
 *   subscriptions, polls) happens only while something is on screen.
 */

export interface Readable<T> {
  subscribe(run: (value: T) => void): () => void;
  get(): T;
}

export interface Writable<T> extends Readable<T> {
  set(value: T): void;
  update(fn: (value: T) => T): void;
}

export type StartStop<T> = (set: (value: T) => void, update: (fn: (value: T) => T) => void) => void | (() => void);

export function writable<T>(initial: T, start?: StartStop<T>): Writable<T> {
  let value = initial;
  let stop: (() => void) | void = undefined;
  const subscribers = new Set<(value: T) => void>();

  const set = (next: T) => {
    if (Object.is(next, value)) return;
    value = next;
    for (const run of [...subscribers]) run(value);
  };
  const update = (fn: (value: T) => T) => set(fn(value));

  return {
    get: () => value,
    set,
    update,
    subscribe(run) {
      subscribers.add(run);
      if (subscribers.size === 1 && start) stop = start(set, update);
      run(value);
      return () => {
        if (!subscribers.delete(run)) return;
        if (subscribers.size === 0 && stop) {
          const halt = stop;
          stop = undefined;
          halt();
        }
      };
    },
  };
}

/** A store whose value is derived from another's, recomputed only when that one changes. */
export function derived<S, T>(source: Readable<S>, fn: (value: S) => T): Readable<T> {
  let last: { input: S; output: T } | null = null;
  const compute = (input: S) => {
    if (!last || !Object.is(last.input, input)) last = { input, output: fn(input) };
    return last.output;
  };
  const inner = writable<T>(compute(source.get()), set => source.subscribe(v => set(compute(v))));
  return { subscribe: inner.subscribe, get: () => compute(source.get()) };
}
