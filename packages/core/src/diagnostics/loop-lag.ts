/**
 * How late do timers fire? A blocked JavaScript thread runs every socket callback and
 * timeout late, peers time each other out, and a strand spirals; on phones messages took
 * minutes where Node takes a second. A 250 ms tick measures that directly, and each report
 * gives the worst lateness and the time the loop was more than 100 ms behind.
 *
 * Platform-free: the phone starts it in development builds; anything else can too.
 */
export type LoopLagReport = { worstMs: number; blockedMs: number; spanMs: number; ticks: number };

export function formatLoopLag(r: LoopLagReport): string {
  return `worst ${r.worstMs} ms late, ${r.blockedMs} ms of ${r.spanMs} ms blocked (${Math.round(100 * r.blockedMs / r.spanMs)}%), ${r.ticks} ticks`;
}

/** Start measuring; `report` is called every `reportMs`. Returns a stop function. */
export function startLoopLag(report: (r: LoopLagReport) => void, opts: { tickMs?: number; reportMs?: number } = {}): () => void {
  const tickMs = opts.tickMs ?? 250;
  const reportMs = opts.reportMs ?? 30_000;
  let expected = Date.now() + tickMs;
  let worst = 0, blocked = 0, ticks = 0, windowStart = Date.now();
  const timer = setInterval(() => {
    const now = Date.now();
    const late = Math.max(0, now - expected);
    expected = now + tickMs;
    ticks++;
    if (late > worst) worst = late;
    if (late > 100) blocked += late;
    if (now - windowStart >= reportMs) {
      report({ worstMs: worst, blockedMs: blocked, spanMs: now - windowStart, ticks });
      worst = 0; blocked = 0; ticks = 0; windowStart = now;
    }
  }, tickMs);
  return () => clearInterval(timer);
}
