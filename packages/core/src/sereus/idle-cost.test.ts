/**
 * What an idle strand costs: two parties share N strands and do nothing, and we measure the
 * process's CPU, its event-loop utilization, and the streams opened per protocol over a quiet
 * window, at N = 1, 5 and 10. A phone pays this per strand on a much slower CPU (the S7 slowed
 * 7× with 13 strands, docs/STATUS.md). Opt-in, a few minutes:
 *
 *   IDLE_COST=1 npx vitest run src/sereus/idle-cost.test.ts
 *   IDLE_COST=1 PROFILE=<dir> …         # a CPU profile of the last window
 *   IDLE_COST=1 PEER_GONE=1 …           # the other member stops before the window: what a
 *                                       # strand costs while its members are unreachable
 */
import { describe, it } from 'vitest';
import { performance } from 'node:perf_hooks';
import { Session } from 'node:inspector/promises';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTestParty, until, type TestParty } from '../testing/node-host.js';

const RUN = !!process.env.IDLE_COST;
const WINDOW_MS = Number(process.env.WINDOW_MS ?? 60_000);
const SETTLE_MS = Number(process.env.SETTLE_MS ?? 20_000);
const STEPS = (process.env.STEPS ?? '1,5,10').split(',').map(Number);
const PEER_GONE = !!process.env.PEER_GONE;

function value<T>(r: { ok: true; value: T } | { ok: false; error: { kind: string; message: string } }): T {
  if (!r.ok) throw new Error(`${r.error.kind}: ${r.error.message}`);
  return r.value;
}

type NodeLike = { getConnections(): Array<{ id: string; streams: Array<{ id: string; protocol?: string; direction: string }> }> };
function nodes(p: TestParty): NodeLike[] {
  const out: NodeLike[] = [];
  const control = p.node.getControlNode() as unknown as NodeLike | null;
  if (control) out.push(control);
  for (const [, inst] of p.node.getStrands()) {
    const n = (inst as { libp2pNode?: NodeLike }).libp2pNode;
    if (n) out.push(n);
  }
  return out;
}

describe.skipIf(!RUN)('the cost of idle strands', () => {
  it(`N = ${STEPS.join(', ')} strands, the stack's blobs`, async () => {
    const a = await createTestParty('idle-a', { listen: true });
    const b = await createTestParty('idle-b', { listen: true });
    try {
      await a.boot(); await b.boot();
      const rows: string[] = [];
      let have = 0;
      for (const n of STEPS) {
        while (have < n) {
          const inv = value(await a.model.invitations.create({ grantsInviteRight: false, visibility: 'private' }));
          const { strandId } = value(await b.model.invitations.accept(inv.token));
          await until(async () => {
            const s = await a.model.strands.list();
            return s.ok && s.value.some(x => x.id === strandId && !x.opening);
          }, 'the strand open at A', 120_000);
          have++;
        }
        await new Promise<void>(r => setTimeout(() => r(), SETTLE_MS));
        // The last step only: B leaves the network for good, and A carries on alone.
        const gone = PEER_GONE && n === STEPS[STEPS.length - 1];
        if (gone) { await b.stop(); await new Promise<void>(r => setTimeout(() => r(), SETTLE_MS)); }

        const session = process.env.PROFILE && n === STEPS[STEPS.length - 1] ? new Session() : null;
        if (session) { session.connect(); await session.post('Profiler.enable'); await session.post('Profiler.start'); }
        const seen = new Set<string>();
        const streams = new Map<string, number>();
        const sample = () => {
          for (const p of (PEER_GONE && n === STEPS[STEPS.length - 1] ? [a] : [a, b])) for (const node of nodes(p)) for (const c of node.getConnections()) for (const s of c.streams) {
            const key = `${p.tag}/${c.id}/${s.id}`;
            if (seen.has(key)) continue;
            seen.add(key);
            const proto = (s.protocol ?? '(negotiating)').replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, '*');
            streams.set(proto, (streams.get(proto) ?? 0) + 1);
          }
        };
        const timer = setInterval(sample, Number(process.env.SAMPLE_MS ?? 250));
        const cpu0 = process.cpuUsage();
        const elu0 = performance.eventLoopUtilization();
        await new Promise<void>(r => setTimeout(() => r(), WINDOW_MS));
        const cpu = process.cpuUsage(cpu0);
        const elu = performance.eventLoopUtilization(elu0);
        clearInterval(timer);
        if (session) {
          const { profile } = await session.post('Profiler.stop');
          writeFileSync(join(process.env.PROFILE!, `idle-${n}-blobs${PEER_GONE ? '-gone' : ''}.cpuprofile`), JSON.stringify(profile));
          session.disconnect();
        }
        const cpuPct = ((cpu.user + cpu.system) / 1000 / WINDOW_MS) * 100;
        const perMin = (k: number) => (k * 60_000 / WINDOW_MS).toFixed(0);
        const top = [...streams].sort((x, y) => y[1] - x[1]).slice(0, 8).map(([p, k]) => `${p} ${perMin(k)}`).join(', ');
        rows.push(`N=${n}${PEER_GONE && n === STEPS[STEPS.length - 1] ? ' (peer gone)' : ''}: CPU ${cpuPct.toFixed(1)}% (both parties), event loop ${(elu.utilization * 100).toFixed(1)}% busy, streams/min ${perMin([...streams.values()].reduce((s, k) => s + k, 0))}: ${top}`);
        process.stderr.write(`[idle-cost] ${rows[rows.length - 1]}\n`);
      }
      process.stderr.write(`[idle-cost] the stack's blobs\n${rows.map(r => `  ${r}`).join('\n')}\n`);
    } finally {
      await Promise.allSettled([a.stop(), b.stop()]);
    }
  }, 1_800_000);
});
