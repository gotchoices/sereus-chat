// Native Ed25519 and SHA-256/512 behind `crypto.subtle`, from boot.
//
// TEMPORARY, AND THE ONLY POLYFILL CHAT STILL CARRIES. Everything else comes from
// `@serfab/cadre-rn/polyfills`. This file is what gotchoices/sereus#33 adds to the kit as
// `@serfab/cadre-rn/polyfills/native-crypto`; once a release carries it, replace this
// file's import in index.js with that one and delete this file.
//
// ED25519. @libp2p/crypto signs and verifies Ed25519 through WebCrypto when a probe
// `subtle.generateKey({ name: 'Ed25519' })` succeeds, and otherwise through pure-JS
// @noble/curves. Under Hermes that fallback measured 169 ms per verify on a Galaxy S7,
// against 0.72 ms for quick-crypto's native subtle; with it, a two-member strand pinned
// the S7's JS thread at 100% and it stopped answering its peer's writes in time. The
// probe runs once, when @libp2p/crypto's Ed25519 module evaluates, and its answer is
// memoized — so this must run at boot, before libp2p loads, which is why it cannot wait
// for `@serfab/cadre-rn/noise-crypto` the way the digest can. Only the methods libp2p's
// Ed25519 path calls are filled, and only where no native implementation exists.
// Signatures are byte-identical to noble's (Ed25519 is deterministic).
//
// DIGEST. The kit's boot polyfill hashes in pure JS and tags that digest; the kit's
// `installNativeDigest` swaps in quick-crypto's after a known-vector check. The kit does
// that itself when `/noise-crypto` loads; doing it here as well covers the hashing that
// happens before the node module loads. Idempotent.
//
// Imported after `@serfab/cadre-rn/polyfills`: quick-crypto loads readable-stream,
// which reads Symbol.asyncIterator and friends at module scope.
import QuickCrypto from 'react-native-quick-crypto';
import { installNativeDigest } from '@serfab/cadre-rn/native-digest';

const subtle = globalThis.crypto.subtle;
const native = QuickCrypto?.subtle;
if (native) {
	for (const method of ['generateKey', 'importKey', 'exportKey', 'sign', 'verify']) {
		if (typeof subtle[method] !== 'function') {
			subtle[method] = native[method].bind(native);
		}
	}
} else {
	console.warn('[polyfills] quick-crypto subtle unavailable — Ed25519 runs in pure JS and will be slow');
}

const createHash = QuickCrypto?.createHash;
const digest = typeof createHash === 'function' ? installNativeDigest(createHash) : 'check-failed';
if (digest !== 'installed' && digest !== 'already') {
	console.warn(`[polyfills] native SHA digest not installed (${digest}) — block hashing runs in pure JS and will be slow`);
}
