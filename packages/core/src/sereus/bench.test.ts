/**
 * The raw-throughput bench (`bench.ts`): a member times plain bytes each way to another
 * member's strand node, with no database involved.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestParty, until, type TestParty } from '../testing/node-host.js';
import { benchStrand, ensureBenchHandler } from './bench.js';

function value<T>(result: { ok: true; value: T } | { ok: false; error: { kind: string; message: string } }): T {
  if (!result.ok) throw new Error(`${result.error.kind}: ${result.error.message}`);
  return result.value;
}

describe('raw-throughput bench', () => {
  let a: TestParty, b: TestParty, strandId: string;
  beforeAll(async () => {
    a = await createTestParty('bench-a', { listen: true });
    b = await createTestParty('bench-b', { listen: true });
    await a.boot(); await b.boot();
    const inv = value(await a.model.invitations.create({ grantsInviteRight: false, visibility: 'private' }));
    strandId = value(await b.model.invitations.accept(inv.token)).strandId;
    await until(async () => {
      const s = await a.model.strands.list();
      return s.ok && s.value.some(x => x.id === strandId && !x.opening);
    }, 'the strand open at A', 120_000);
  }, 180_000);
  afterAll(async () => { await Promise.allSettled([a?.stop(), b?.stop()]); });

  it('times 1 MB each way to the other member', async () => {
    await ensureBenchHandler(b.node.getStrands().get(strandId)!);
    const results = await benchStrand(a.node.getStrands().get(strandId)!, 1_000_000);
    process.stderr.write(`[bench] ${JSON.stringify(results.map(r => ({ path: r.path, direction: r.direction, ms: r.ms, mbPerSecond: r.mbPerSecond })))}\n`);
    expect(results.map(r => r.direction).sort()).toEqual(['receive', 'send']);
    for (const r of results) expect(r.bytes).toBe(1_000_000);
  }, 120_000);
});
