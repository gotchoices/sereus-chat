import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { derived, writable } from './store.js';
import { loader } from './loader.js';
import { fail, ok, type Result } from '../model/index.js';

describe('writable', () => {
  it('starts on the first subscriber, stops after the last, and keeps its snapshot', () => {
    const stop = vi.fn();
    const start = vi.fn(() => stop);
    const s = writable({ n: 1 }, start);
    const first = s.get();
    const seen: number[] = [];
    const u1 = s.subscribe(v => seen.push(v.n));
    const u2 = s.subscribe(() => {});
    expect(start).toHaveBeenCalledTimes(1);
    expect(s.get()).toBe(first);
    s.set(first); // same object: no notification
    expect(seen).toEqual([1]);
    s.set({ n: 2 });
    expect(seen).toEqual([1, 2]);
    u1(); expect(stop).not.toHaveBeenCalled();
    u2(); expect(stop).toHaveBeenCalledTimes(1);
  });

  it('derives only when the source changes', () => {
    const s = writable(2);
    const fn = vi.fn((n: number) => ({ double: n * 2 }));
    const d = derived(s, fn);
    const unsub = d.subscribe(() => {});
    const a = d.get();
    expect(d.get()).toBe(a);
    s.set(3);
    expect(d.get()).toEqual({ double: 6 });
    unsub();
  });
});

describe('loader', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('reads on subscribe, debounces changes into one read, and stops when unsubscribed', async () => {
    let n = 0;
    let fire: () => void = () => {};
    const unsubscribeChanges = vi.fn();
    const l = loader<number>({
      load: async () => ok(++n),
      changes: onChange => { fire = onChange; return unsubscribeChanges; },
    });
    expect(l.get().state).toBe('loading');
    const unsub = l.subscribe(() => {});
    await vi.runAllTimersAsync();
    expect(l.get()).toMatchObject({ state: 'ready', value: 1 });
    fire(); fire(); fire();
    await vi.advanceTimersByTimeAsync(600);
    expect(l.get()).toMatchObject({ state: 'ready', value: 2 });
    unsub();
    expect(unsubscribeChanges).toHaveBeenCalled();
    fire();
    await vi.advanceTimersByTimeAsync(600);
    expect(n).toBe(2);
  });

  it('runs one read at a time, and once more when asked during a read', async () => {
    let n = 0;
    let concurrent = 0, maxConcurrent = 0;
    const l = loader<number>({
      load: async () => {
        concurrent++; maxConcurrent = Math.max(maxConcurrent, concurrent);
        await new Promise(r => setTimeout(r, 100));
        concurrent--;
        return ok(++n);
      },
    });
    const unsub = l.subscribe(() => {});
    l.reload(); l.reload(); l.reload();
    await vi.advanceTimersByTimeAsync(1000);
    expect(maxConcurrent).toBe(1);
    expect(n).toBe(2);
    unsub();
  });

  it('keeps the last value when a refresh fails, and fails only a first read', async () => {
    const results: Result<string>[] = [ok('a'), fail('unavailable', 'down')];
    const l = loader<string>({ load: async () => results.shift() ?? fail('unavailable', 'down') });
    const unsub = l.subscribe(() => {});
    await vi.runAllTimersAsync();
    await l.refresh();
    expect(l.get()).toMatchObject({ state: 'ready', value: 'a', error: { kind: 'unavailable' } });
    unsub();

    const failing = loader<string>({ load: async () => fail('unavailable', 'down') });
    const unsub2 = failing.subscribe(() => {});
    await vi.runAllTimersAsync();
    expect(failing.get()).toMatchObject({ state: 'failed', error: { kind: 'unavailable' } });
    unsub2();
  });

  it('polls while subscribed, at the interval the function gives', async () => {
    let n = 0;
    const l = loader<number>({ load: async () => ok(++n), pollMs: () => (n < 3 ? 1000 : undefined) });
    const unsub = l.subscribe(() => {});
    await vi.advanceTimersByTimeAsync(5000);
    expect(n).toBe(3);
    unsub();
  });
});
