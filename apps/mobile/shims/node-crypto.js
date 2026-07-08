// Minimal Node.js 'crypto' module shim for React Native (mirrors the sereus
// reference app's polyfills/node-crypto.js and ser/health/apps/mobile).
//
// Metro can't resolve `node:crypto`; some transitive deps import it. This provides
// createHash() via @noble/hashes (pure JS, no native deps). The app's runtime
// crypto.subtle is polyfilled separately in index.js.
//
// @serfab/cadre-core's FCM push-notifier (push-notifier-fcm.js) imports this and
// calls crypto.sign('RSA-SHA256', …) — a path this app does NOT use (push isn't
// wired). We export a `sign` that throws clearly rather than leaving it undefined,
// so if push is ever enabled the failure is obvious rather than a silent
// "sign is not a function".
//
// Only referenced from metro.config.js in `npm` stack mode (cadre-core 0.8.x).

import { sha256, sha512 } from '@noble/hashes/sha2';

const hashFns = { sha256, 'sha-256': sha256, sha512, 'sha-512': sha512 };

class Hash {
  constructor(fn) { this._fn = fn; this._chunks = []; }
  update(data) {
    if (typeof data === 'string') data = new TextEncoder().encode(data);
    this._chunks.push(data);
    return this;
  }
  digest() {
    let total = 0;
    for (const c of this._chunks) total += c.length;
    const buf = new Uint8Array(total);
    let off = 0;
    for (const c of this._chunks) { buf.set(c, off); off += c.length; }
    return this._fn(buf);
  }
}

export function createHash(algorithm) {
  const fn = hashFns[algorithm.toLowerCase()];
  if (!fn) throw new Error(`node-crypto shim: unsupported hash algorithm '${algorithm}'`);
  return new Hash(fn);
}

export function sign() {
  throw new Error('node:crypto.sign is not supported on React Native (FCM push is not wired in this app).');
}

export default { createHash, sign };
