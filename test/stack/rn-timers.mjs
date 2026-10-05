// rn-timers.mjs — make Node's setTimeout behave like React Native's for an experiment:
// every timer waits at least RN_TIMER_MIN_MS (default 17, the emulator's measured
// setTimeout(0) hop; the S21 measured 20.6, the S7 155). Preload with
//   node --import ./rn-timers.mjs message-latency.mjs
const MIN = Number(process.env.RN_TIMER_MIN_MS ?? 17);
const orig = globalThis.setTimeout;
globalThis.setTimeout = function (fn, ms, ...args) { return orig(fn, Math.max(MIN, Number(ms) || 0), ...args); };
console.log(`[rn-timers] setTimeout floor ${MIN} ms`);
