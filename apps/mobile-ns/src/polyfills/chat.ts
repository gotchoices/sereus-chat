/**
 * Polyfills chat needs beyond sereus's reference-app-ns set (the other files here, copied
 * as they are). Imported last by the barrel.
 *
 * queueMicrotask — absent on NativeScript's V8. libp2p's relay dialling (circuit-relay-v2
 * as of the 1.15 stack) calls it, and without it no relay reservation is ever made
 * ("queueMicrotask is not defined"). Worth adding to reference-app-ns upstream.
 */
const g = globalThis as { queueMicrotask?: (cb: () => void) => void };
if (typeof g.queueMicrotask !== 'function') {
  g.queueMicrotask = (cb: () => void) => {
    Promise.resolve().then(cb).catch(err => setTimeout(() => { throw err; }, 0));
  };
}

