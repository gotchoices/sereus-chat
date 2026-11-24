/**
 * The start-up queue while a join runs (`StrandRuntime.holdWhile`): no strand starts from the
 * queue until the join is through, or the hold's limit passes.
 */
import { describe, expect, it } from 'vitest';
import type { ChatHost } from './host.js';
import { StrandRuntime } from './strands.js';
import { memorySlots } from '../testing/node-host.js';

type Queue = { enqueue(id: string, attach: () => Promise<void>): Promise<void> };

function runtime(listed: string[]): { rt: StrandRuntime; started: string[]; queue: Queue } {
  const slot = memorySlots();
  const summaries = Object.fromEntries(listed.map((id, i) => [id, { id, title: id, lastMessage: { timestamp: new Date(Date.now() - i * 1000).toISOString() } }]));
  void slot('strandSummaries').save(JSON.stringify(summaries));
  const host = { slot, node: { node: null }, strandStart: { recentCount: 99, recentMs: 0, gapMs: 0 } } as unknown as ChatHost;
  const rt = new StrandRuntime(host);
  const started: string[] = [];
  return { rt, started, queue: rt as unknown as Queue };
}

const tick = (ms = 20) => new Promise<void>(r => setTimeout(() => r(), ms));

describe('the start-up queue during a join', () => {
  it('holds every strand until the join is through, then starts them in order', async () => {
    const { rt, started, queue } = runtime(['old-1', 'old-2']);
    let finishJoin!: () => void;
    const join = rt.holdWhile(() => new Promise<void>(r => { finishJoin = r; }));
    const waiting = ['old-2', 'old-1', 'new'].map(id => queue.enqueue(id, async () => { started.push(id); }));
    await tick();
    expect(started).toEqual([]);
    finishJoin();
    await join;
    await Promise.all(waiting);
    // Never listed first, then the most recently active.
    expect(started).toEqual(['new', 'old-1', 'old-2']);
  });

  it('lets the rest start once the hold times out', async () => {
    const { rt, started, queue } = runtime(['old-1']);
    let finishJoin!: () => void;
    const join = rt.holdWhile(() => new Promise<void>(r => { finishJoin = r; }), 50);
    const old = queue.enqueue('old-1', async () => { started.push('old-1'); });
    await tick();
    expect(started).toEqual([]);
    await old;
    expect(started).toEqual(['old-1']);
    finishJoin();
    await join;
  });
});
