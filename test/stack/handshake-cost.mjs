/**
 * The Node half of the device handshake-cost measurement.
 *
 * Runs the identical primitives as `apps/mobile/src/diagnostics/handshake-cost.ts`
 * so the phone's numbers have something to mean. Absolute figures are not the
 * point; the RATIO is. If x25519 costs ~0.2 ms here and ~50 ms there, a Noise
 * handshake is ~200 ms of pure CPU on the device before a byte moves, and a
 * bring-up that opens many connections and pushes ~7,000 frames cannot finish
 * inside anyone's timeouts.
 *
 * Usage:  node handshake-cost.mjs
 */
import { x25519, ed25519 } from '@noble/curves/ed25519.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { chacha20poly1305 } from '@noble/ciphers/chacha.js';

const BRINGUP_FRAMES = 7000;
const DH_PER_HANDSHAKE = 4;
const FRAME_BYTES = 512;

function timed(iterations, fn) {
  fn();                       // warm-up, as on the device
  const t0 = performance.now();
  for (let i = 0; i < iterations; i += 1) fn();
  return (performance.now() - t0) / iterations;
}

const aPriv = x25519.utils.randomSecretKey();
const bPub = x25519.getPublicKey(x25519.utils.randomSecretKey());
const dhMs = timed(20, () => { x25519.getSharedSecret(aPriv, bPub); });

const edPriv = ed25519.utils.randomSecretKey();
const edPub = ed25519.getPublicKey(edPriv);
const msg = new Uint8Array(64).fill(7);
const signMs = timed(20, () => { ed25519.sign(msg, edPriv); });
const sig = ed25519.sign(msg, edPriv);
const verifyMs = timed(20, () => { ed25519.verify(sig, msg, edPub); });

const key = new Uint8Array(32).fill(3);
const nonce = new Uint8Array(12).fill(5);
const payload = new Uint8Array(FRAME_BYTES).fill(9);
const aeadMs = timed(200, () => { chacha20poly1305(key, nonce).encrypt(payload); });
const shaMs = timed(200, () => { sha256(payload); });

const row = (label, ms, note) =>
  console.log(`  ${label.padEnd(34)} ${ms.toFixed(3).padStart(9)} ms/op   ${note ?? ''}`);

console.log(`\nNode ${process.version} — ${process.arch}\n`);
row('x25519 shared secret', dhMs, `~${(dhMs * DH_PER_HANDSHAKE).toFixed(1)}ms crypto per Noise handshake`);
row('ed25519 sign', signMs);
row('ed25519 verify', verifyMs);
row(`chacha20-poly1305 seal (${FRAME_BYTES}B)`, aeadMs, `~${(aeadMs * BRINGUP_FRAMES / 1000).toFixed(2)}s per ${BRINGUP_FRAMES} frames`);
row(`sha256 (${FRAME_BYTES}B)`, shaMs, `~${(shaMs * BRINGUP_FRAMES / 1000).toFixed(2)}s per ${BRINGUP_FRAMES} frames`);
console.log(`\n  Noise crypto floor per connection: ~${(dhMs * DH_PER_HANDSHAKE).toFixed(1)} ms`);
console.log(`  Per-frame symmetric x ${BRINGUP_FRAMES}: ~${((aeadMs + shaMs) * BRINGUP_FRAMES / 1000).toFixed(2)} s\n`);
