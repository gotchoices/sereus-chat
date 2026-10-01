/**
 * loop-lag.ts — dev-only: how late do timers fire on this device?
 *
 * Messages took minutes between two phones, while the same exchange takes about
 * a second in Node (test/stack/message-latency.mjs). If the JS thread is blocked
 * for seconds at a time, every socket callback and timeout runs late, peers time
 * each other out, and the strand spirals. This measures that directly: a 250 ms
 * tick, and every 30 s one `[perf] loop` line with the worst lateness and the
 * total time the loop was more than 100 ms behind.
 */
const TICK_MS = 250;
const REPORT_MS = 30_000;

let started = false;

export function startLoopLagMonitor(): void {
  if (!__DEV__ || started) return;
  started = true;
  let expected = Date.now() + TICK_MS;
  let worst = 0, blocked = 0, ticks = 0, windowStart = Date.now();
  setInterval(() => {
    const now = Date.now();
    const late = Math.max(0, now - expected);
    expected = now + TICK_MS;
    ticks++;
    if (late > worst) worst = late;
    if (late > 100) blocked += late;
    if (now - windowStart >= REPORT_MS) {
      const span = now - windowStart;
      console.info('[perf] loop', `worst ${worst} ms late, ${blocked} ms of ${span} ms blocked (${Math.round(100 * blocked / span)}%), ${ticks} ticks`);
      worst = 0; blocked = 0; ticks = 0; windowStart = now;
    }
  }, TICK_MS);
}
