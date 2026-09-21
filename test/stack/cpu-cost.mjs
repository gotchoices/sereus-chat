/**
 * Model a slow device's CRYPTO CPU cost, in Node, with no device attached.
 *
 * Measured on a Galaxy S7 (Hermes, ARM) against Node (V8, x64) — same primitives,
 * same sizes, the code path libp2p actually uses:
 *
 *   x25519 shared secret      2.635 ms -> 57.650 ms   (22x)
 *   ed25519 sign              1.370 ms -> 26.000 ms   (19x)
 *   ed25519 verify            2.720 ms -> 89.950 ms   (33x)
 *   chacha20-poly1305 (512B)  0.053 ms ->  7.760 ms  (146x)
 *   sha256 (512B)             0.027 ms -> 15.165 ms  (561x)
 *
 * Hermes has no JIT and `@noble/*` is pure JavaScript, so V8 optimises what Hermes
 * interprets. The symmetric primitives suffer worst: they are tight
 * bit-manipulation loops.
 *
 * WHY A BLOCKING BURN IS THE RIGHT MODEL HERE, when it was the wrong one for
 * network latency (gotchoices/sereus#13): a slow CPU genuinely does block other
 * work, so the cost compounds across operations by nature. Frames on a slow LINK
 * stay overlapped in flight and do not. Same mechanism, opposite correctness,
 * depending on which resource is scarce. This is why the injection has to sit at
 * the crypto layer rather than the socket.
 *
 * WHERE IT HOOKS, and a finding in its own right. `@chainsafe/libp2p-noise` ships
 * TWO defaults and picks by build condition:
 *
 *   node    `crypto/index.js`         -> native `node:crypto` (OpenSSL) for sha256,
 *                                        x25519 keygen and DH, plus WASM
 *                                        (`@chainsafe/as-chacha20poly1305`) for the cipher
 *   browser `crypto/index.browser.js` -> `defaultCrypto = pureJsCrypto`, pure JavaScript
 *
 * React Native resolves the BROWSER build. So the device is not merely running the
 * same code more slowly — it is running an entirely different, unaccelerated
 * implementation, interpreted by an engine with no JIT. That is the real gap, and
 * it is much wider than the noble-vs-noble ratios we first measured.
 *
 * Patching `pureJsCrypto` therefore does nothing in Node (noise never calls it
 * here), which is exactly what the first version of this file did. We patch
 * `defaultCrypto` instead, reached by file URL because the package's `exports`
 * map does not expose that path — the URL resolves to the same module instance
 * noise.js itself imports.
 *
 * MUST BE IMPORTED BEFORE ANY NODE IS CONSTRUCTED. `wrapCrypto` COPIES the method
 * references when `noise()` is built, so a later patch would be ignored.
 *
 * Usage:  CPU_SLOWDOWN=1 node two-party-formation.mjs     # full S7 cost
 *         CPU_SLOWDOWN=0.25 node two-party-formation.mjs  # quarter of it
 */
// Bypasses the package `exports` map; same resolved file, same module instance.
const cryptoModule = await import(
  new URL('./node_modules/@chainsafe/libp2p-noise/dist/src/crypto/index.js', import.meta.url).href
);
const { defaultCrypto } = cryptoModule;

/** 1.0 == the deltas measured on the S7. 0 disables. */
const SCALE = Number(process.env.CPU_SLOWDOWN ?? 0);

/**
 * ABSOLUTE measured device cost, not a delta.
 *
 * Node's own path here is native, so what it replaces is microseconds — charging
 * the device's full figure is both simpler and very slightly conservative.
 */
const DELTA_MS = {
  x25519: 57.65,         // measured on the S7
  sha256_512: 15.17,     // per 512 bytes
  chacha_512: 7.76,      // per 512 bytes
};
const REF_BYTES = 512;

/** Occupy the CPU, rather than yielding it. That is the whole point. */
function burn(ms) {
  if (!(ms > 0)) return;
  const until = performance.now() + ms;
  while (performance.now() < until) { /* spin */ }
}

function byteLengthOf(data) {
  if (data == null) return 0;
  if (typeof data.byteLength === 'number') return data.byteLength;
  if (typeof data.length === 'number') return data.length;
  return 0;
}

let ops = 0;
let burnedMs = 0;

const seen = new Set();
function charge(ms, what) {
  if (process.env.CPU_TRACE === '1' && what && !seen.has(what)) {
    seen.add(what);
    console.log(`[cpu-cost] first call: ${what}`);
  }
  ops += 1;
  burnedMs += ms;
  burn(ms);
}

if (SCALE > 0) {
  const orig = { ...defaultCrypto };

  // Asymmetric: paid per handshake, several times each.
  defaultCrypto.generateX25519SharedKey = (priv, pub) => {
    charge(DELTA_MS.x25519 * SCALE, 'dh');
    return orig.generateX25519SharedKey(priv, pub);
  };
  defaultCrypto.generateX25519KeyPair = () => {
    // Not measured separately on the device; keygen and DH are the same curve
    // operation class, so the DH delta stands in. Noted rather than hidden.
    charge(DELTA_MS.x25519 * SCALE, 'keygen');
    return orig.generateX25519KeyPair();
  };
  defaultCrypto.generateX25519KeyPairFromSeed = (seed) => {
    charge(DELTA_MS.x25519 * SCALE);
    return orig.generateX25519KeyPairFromSeed(seed);
  };

  // Symmetric: paid per FRAME, which is where the bring-up cost lives.
  defaultCrypto.hashSHA256 = (data) => {
    charge(DELTA_MS.sha256_512 * SCALE * (byteLengthOf(data) / REF_BYTES), 'sha256');
    return orig.hashSHA256(data);
  };
  defaultCrypto.chaCha20Poly1305Encrypt = (plaintext, nonce, ad, k) => {
    charge(DELTA_MS.chacha_512 * SCALE * (byteLengthOf(plaintext) / REF_BYTES), 'encrypt');
    return orig.chaCha20Poly1305Encrypt(plaintext, nonce, ad, k);
  };
  defaultCrypto.chaCha20Poly1305Decrypt = (ciphertext, nonce, ad, k, dst) => {
    charge(DELTA_MS.chacha_512 * SCALE * (byteLengthOf(ciphertext) / REF_BYTES));
    return orig.chaCha20Poly1305Decrypt(ciphertext, nonce, ad, k, dst);
  };
  // HKDF runs sha256 several times internally via noble, below our hashSHA256
  // hook, so it is charged explicitly rather than silently escaping.
  defaultCrypto.getHKDF = (ck, ikm) => {
    charge(DELTA_MS.sha256_512 * SCALE * 3, 'hkdf');
    return orig.getHKDF(ck, ikm);
  };

  console.log(`[cpu-cost] modelling ${SCALE}x of the measured S7 crypto deltas`);
  process.on('exit', () => {
    console.log(`[cpu-cost] ${ops} crypto ops, ${(burnedMs / 1000).toFixed(1)}s of CPU burned`);
  });
}
