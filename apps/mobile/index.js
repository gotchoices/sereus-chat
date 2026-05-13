/**
 * @format
 *
 * RN/Hermes polyfills required by the sereus/optimystic/libp2p stack.
 * Must run before any library imports — App.tsx pulls in modules that
 * reference these globals at module-scope.  Source-of-truth for what's
 * required: sereus/docs/reference-app-rn.md.
 */

// ── Timer .ref() / .unref() ────────────────────────────────────────────────
// Node timers are objects with .ref()/.unref(); Hermes returns plain numbers.
// Required by @optimystic/db-p2p, undici, libp2p internals.
const _origSetTimeout = globalThis.setTimeout;
const _origSetInterval = globalThis.setInterval;
const _origClearTimeout = globalThis.clearTimeout;
const _origClearInterval = globalThis.clearInterval;

function _unwrapTimer(handle) {
  return (handle && typeof handle === 'object' && '_id' in handle) ? handle._id : handle;
}
function _wrapTimer(id) {
  if (typeof id === 'object' && id !== null) return id;
  return {
    _id: id,
    ref() { return this; },
    unref() { return this; },
    [Symbol.toPrimitive]() { return this._id; },
  };
}
globalThis.setTimeout = function patchedSetTimeout(...args) {
  return _wrapTimer(_origSetTimeout.apply(this, args));
};
Object.assign(globalThis.setTimeout, _origSetTimeout);
globalThis.setInterval = function patchedSetInterval(...args) {
  return _wrapTimer(_origSetInterval.apply(this, args));
};
Object.assign(globalThis.setInterval, _origSetInterval);
globalThis.clearTimeout = function patchedClearTimeout(handle) {
  return _origClearTimeout.call(this, _unwrapTimer(handle));
};
globalThis.clearInterval = function patchedClearInterval(handle) {
  return _origClearInterval.call(this, _unwrapTimer(handle));
};

// ── EventTarget / Event ────────────────────────────────────────────────────
import 'event-target-polyfill';

// CustomEvent is not provided by event-target-polyfill; libp2p's
// safeDispatchEvent uses it internally.
if (typeof globalThis.CustomEvent === 'undefined') {
  globalThis.CustomEvent = class CustomEvent extends Event {
    constructor(type, params) {
      super(type, params);
      this.detail = params?.detail ?? null;
    }
  };
}

// ── Promise.withResolvers (ES2024) ─────────────────────────────────────────
if (typeof Promise.withResolvers === 'undefined') {
  Promise.withResolvers = function () {
    let resolve, reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
  };
}

// ── AbortSignal.throwIfAborted ─────────────────────────────────────────────
if (typeof AbortSignal !== 'undefined' &&
    typeof AbortSignal.prototype.throwIfAborted === 'undefined') {
  AbortSignal.prototype.throwIfAborted = function () {
    if (this.aborted) throw this.reason ?? new DOMException('The operation was aborted', 'AbortError');
  };
}

// ── crypto.getRandomValues ─────────────────────────────────────────────────
import 'react-native-get-random-values';

// ── crypto.subtle.digest (targeted; SHA-256/SHA-512 only) ──────────────────
// multiformats/hashes/sha2-browser calls crypto.subtle.digest().  Backed by
// @noble/hashes to avoid pulling in a native Web Crypto module.
import { sha256, sha512 } from '@noble/hashes/sha2';
if (typeof globalThis.crypto === 'undefined') {
  globalThis.crypto = {};
}
if (!globalThis.crypto.subtle) {
  globalThis.crypto.subtle = {
    digest: async (algorithm, data) => {
      const name = typeof algorithm === 'string' ? algorithm : algorithm.name;
      const input = data instanceof Uint8Array ? data : new Uint8Array(data);
      if (name === 'SHA-256') return sha256(input).buffer;
      if (name === 'SHA-512') return sha512(input).buffer;
      throw new Error(`crypto.subtle.digest: unsupported algorithm ${name}`);
    },
  };
}

// ── structuredClone ───────────────────────────────────────────────────────
// @optimystic/db-core uses it for defensive deep cloning.
import structuredClone from '@ungap/structured-clone';
if (typeof global.structuredClone === 'undefined') {
  global.structuredClone = structuredClone;
}

// ── Web Streams ───────────────────────────────────────────────────────────
import {
  ReadableStream,
  WritableStream,
  TransformStream,
} from 'web-streams-polyfill';
if (typeof global.ReadableStream === 'undefined') global.ReadableStream = ReadableStream;
if (typeof global.WritableStream === 'undefined') global.WritableStream = WritableStream;
if (typeof global.TransformStream === 'undefined') global.TransformStream = TransformStream;

// ── Symbol.asyncIterator (registry-backed for cross-polyfill convergence) ──
if (typeof Symbol !== 'undefined' && typeof Symbol.asyncIterator === 'undefined') {
  try {
    Object.defineProperty(Symbol, 'asyncIterator', {
      value: Symbol.for('Symbol.asyncIterator'),
      configurable: false,
      enumerable: false,
      writable: false,
    });
  } catch {
    Symbol.asyncIterator = Symbol.for('Symbol.asyncIterator');
  }
}

// ── Intl.PluralRules (English-only) ───────────────────────────────────────
// moat-maker (dep of optimystic) constructs PluralRules at module scope for
// ordinal formatting in error messages.
if (typeof Intl !== 'undefined' && typeof Intl.PluralRules === 'undefined') {
  const ordinalRules = (n) => {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return 'one';
    if (mod10 === 2 && mod100 !== 12) return 'two';
    if (mod10 === 3 && mod100 !== 13) return 'few';
    return 'other';
  };
  const cardinalRules = (n) => (n === 1 ? 'one' : 'other');
  Intl.PluralRules = class PluralRules {
    constructor(_locale, options) { this._type = options?.type === 'ordinal' ? 'ordinal' : 'cardinal'; }
    select(n) { return this._type === 'ordinal' ? ordinalRules(n) : cardinalRules(n); }
    resolvedOptions() { return { type: this._type, locale: 'en' }; }
  };
}

// ── App entry ──────────────────────────────────────────────────────────────
import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);
