/**
 * Starve the event loop WITHOUT making any operation intrinsically slower.
 *
 * `cpu-cost.mjs` charges its burn inside the Noise crypto, which does two things
 * at once: each crypto call takes longer, AND the single-threaded JS loop is
 * blocked while it does. Those are different hypotheses for why a slow peer
 * diverges, and the measurement so far cannot tell them apart:
 *
 *   elapsed-time  — operations genuinely take longer, so deadlines sized for a
 *                   fast peer lapse. Raising the deadlines should then help.
 *   starvation    — the loop is blocked, so TIMERS AND HANDLERS RUN LATE
 *                   regardless of how generously any deadline is set. Raising
 *                   deadlines should NOT help, which is what we observed when
 *                   every Fret budget was raised 10x and nothing changed.
 *
 * This isolates the second: crypto stays at native speed, and a periodic burn
 * blocks the loop on a fixed duty cycle. If a run fails here while consuming LESS
 * total CPU than a passing `CPU_SLOWDOWN` run, then the pattern of starvation
 * matters more than the amount of work — and adaptive deadlines alone will not
 * save a saturated runtime.
 *
 * Usage:  LOOP_HOG_DUTY=0.5 node two-party-formation.mjs
 */
const DUTY = Number(process.env.LOOP_HOG_DUTY ?? 0);
const PERIOD_MS = Number(process.env.LOOP_HOG_PERIOD_MS ?? 50);

let burnedMs = 0;

if (DUTY > 0) {
  const slice = Math.max(1, Math.round(PERIOD_MS * Math.min(DUTY, 0.95)));
  setInterval(() => {
    const until = performance.now() + slice;
    while (performance.now() < until) { /* occupy the loop */ }
    burnedMs += slice;
  }, PERIOD_MS).unref?.();

  console.log(`[loop-hog] blocking ${slice}ms every ${PERIOD_MS}ms (duty ${DUTY}) — crypto untouched`);
  process.on('exit', () => {
    console.log(`[loop-hog] ${(burnedMs / 1000).toFixed(1)}s of CPU burned outside the crypto path`);
  });
}
