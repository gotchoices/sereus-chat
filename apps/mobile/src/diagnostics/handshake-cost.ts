/**
 * Where do the seconds go in a dial on this device?
 *
 * Bring-up costs roughly 7,000 outbound frames across four sockets, measured in
 * Node with the same code and the same relay (`test/stack/ws-latency.mjs`,
 * `WS_COUNT_FRAMES=1`). Node finishes that in 2.8 s. The Galaxy S7 takes 1.6 s to
 * 39 s for individual dials and never completes first sync at all.
 *
 * Link latency does not produce figures like that — a point the sereus maintainer
 * made on gotchoices/sereus#13, suspecting CPU-bound handshake cryptography on
 * older ARM. We had evidence pointing the same way and had not joined it up: this
 * phone ran owner genesis in ~1.9 s against the emulator's ~0.5 s, and genesis is
 * also crypto.
 *
 * So this measures the primitives directly, with no network in the way, and the
 * one network cost that is not crypto (handing a frame to RN's socket). Every
 * figure has a Node counterpart from `test/stack/handshake-cost.mjs`, which runs
 * the identical measurements — the comparison is the point, not the absolute
 * numbers.
 *
 * WHAT EACH ONE BUYS:
 *
 *   x25519       One Diffie-Hellman. A Noise XX handshake performs several, so
 *                this multiplied by ~4 is the crypto floor for EVERY connection —
 *                and a relayed strand mesh opens a lot of connections.
 *   ed25519      Keygen, sign, verify. Identity and every signed control row.
 *   chacha/sha   Per-frame symmetric cost, at a realistic frame size. Multiply by
 *                the ~7,000 frames a bring-up sends.
 *   ws.send      NOT crypto: the cost of handing one frame to React Native's
 *                WebSocket. If this is where the time goes, the bridge is the
 *                problem and no amount of faster crypto helps.
 *
 * Dev-only, reached from Settings under `__DEV__`. Uses its own throwaway keys
 * and opens at most one socket; it touches no strand and no app data.
 */
import { x25519 } from '@noble/curves/ed25519.js';
import { ed25519 } from '@noble/curves/ed25519.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { chacha20poly1305 } from '@noble/ciphers/chacha.js';

export type Measurement = {
  label: string;
  /** Milliseconds per operation, averaged over `iterations`. */
  msPerOp: number;
  iterations: number;
  /** What this cost implies at bring-up scale, when that is meaningful. */
  implication?: string;
};

export type CostReport = {
  measurements: Measurement[];
  notes: string[];
};

/** Frames observed during bring-up in Node, for scaling the per-frame costs. */
const BRINGUP_FRAMES = 7000;
/** Noise XX performs several DH operations per handshake. */
const DH_PER_HANDSHAKE = 4;
/** Representative frame payload; strand traffic is mostly small records. */
const FRAME_BYTES = 512;

/** Time `fn` over `iterations`, yielding to the event loop so the UI can paint. */
async function timed(iterations: number, fn: () => void): Promise<number> {
  // One warm-up pass: Hermes compiles lazily, and the first call through a path
  // is not the cost the other 6,999 frames pay.
  fn();
  await new Promise(r => setTimeout(r, 0));
  const t0 = Date.now();
  for (let i = 0; i < iterations; i += 1) fn();
  return (Date.now() - t0) / iterations;
}

export async function runHandshakeCostCheck(
  onProgress?: (line: string) => void,
): Promise<CostReport> {
  const say = (l: string) => onProgress?.(l);
  const measurements: Measurement[] = [];
  const notes: string[] = [];

  // ── X25519: the Noise handshake's dominant asymmetric cost ────────────────
  say('x25519 Diffie-Hellman…');
  const aPriv = x25519.utils.randomSecretKey();
  const bPub = x25519.getPublicKey(x25519.utils.randomSecretKey());
  const dhMs = await timed(20, () => { x25519.getSharedSecret(aPriv, bPub); });
  measurements.push({
    label: 'x25519 shared secret',
    msPerOp: dhMs,
    iterations: 20,
    implication: `~${Math.round(dhMs * DH_PER_HANDSHAKE)}ms of crypto per Noise handshake`,
  });

  // ── Ed25519: identity, and every signed control-database row ──────────────
  say('ed25519 sign/verify…');
  const edPriv = ed25519.utils.randomSecretKey();
  const edPub = ed25519.getPublicKey(edPriv);
  const msg = new Uint8Array(64).fill(7);
  const signMs = await timed(20, () => { ed25519.sign(msg, edPriv); });
  const sig = ed25519.sign(msg, edPriv);
  const verifyMs = await timed(20, () => { ed25519.verify(sig, msg, edPub); });
  measurements.push({ label: 'ed25519 sign', msPerOp: signMs, iterations: 20 });
  measurements.push({ label: 'ed25519 verify', msPerOp: verifyMs, iterations: 20 });

  // ── Per-frame symmetric cost ──────────────────────────────────────────────
  say('chacha20-poly1305 + sha256 per frame…');
  const key = new Uint8Array(32).fill(3);
  const nonce = new Uint8Array(12).fill(5);
  const payload = new Uint8Array(FRAME_BYTES).fill(9);
  const aeadMs = await timed(200, () => { chacha20poly1305(key, nonce).encrypt(payload); });
  const shaMs = await timed(200, () => { sha256(payload); });
  measurements.push({
    label: `chacha20-poly1305 seal (${FRAME_BYTES}B)`,
    msPerOp: aeadMs,
    iterations: 200,
    implication: `~${(aeadMs * BRINGUP_FRAMES / 1000).toFixed(1)}s across a ${BRINGUP_FRAMES}-frame bring-up`,
  });
  measurements.push({
    label: `sha256 (${FRAME_BYTES}B)`,
    msPerOp: shaMs,
    iterations: 200,
    implication: `~${(shaMs * BRINGUP_FRAMES / 1000).toFixed(1)}s across a ${BRINGUP_FRAMES}-frame bring-up`,
  });

  notes.push(
    `Noise handshake crypto floor: ~${Math.round(dhMs * DH_PER_HANDSHAKE)}ms per connection.`,
  );
  notes.push(
    `Per-frame symmetric cost x ${BRINGUP_FRAMES} frames: ` +
      `~${((aeadMs + shaMs) * BRINGUP_FRAMES / 1000).toFixed(1)}s of pure CPU.`,
  );

  return { measurements, notes };
}

/**
 * The non-crypto half: what does it cost to hand ONE frame to RN's WebSocket?
 *
 * Separate from the crypto run because it needs a live socket and can fail on its
 * own terms. `send()` is fire-and-forget into native, so this times the JS-side
 * call only — which is exactly the per-frame tax libp2p pays 7,000 times, and the
 * thing a faster cipher cannot help with.
 */
export async function runSocketFrameCost(
  relayWsUrl: string,
  frames = 200,
  onProgress?: (line: string) => void,
): Promise<Measurement> {
  onProgress?.(`opening ${relayWsUrl}…`);
  const ws = new WebSocket(relayWsUrl);

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('socket did not open within 10s')), 10_000);
    ws.onopen = () => { clearTimeout(timer); resolve(); };
    ws.onerror = () => { clearTimeout(timer); reject(new Error('socket error before open')); };
  });

  try {
    const payload = new Uint8Array(FRAME_BYTES).fill(1);
    // A raw WebSocket to a libp2p relay will be closed as soon as it fails
    // multistream negotiation, so keep this short and treat a mid-run close as a
    // result rather than an error.
    const t0 = Date.now();
    let sent = 0;
    for (let i = 0; i < frames; i += 1) {
      if (ws.readyState !== 1) break;
      ws.send(payload);
      sent += 1;
    }
    const msPerOp = sent > 0 ? (Date.now() - t0) / sent : Number.NaN;
    return {
      label: `WebSocket.send (${FRAME_BYTES}B)`,
      msPerOp,
      iterations: sent,
      implication: Number.isFinite(msPerOp)
        ? `~${(msPerOp * BRINGUP_FRAMES / 1000).toFixed(1)}s across a ${BRINGUP_FRAMES}-frame bring-up`
        : 'socket closed before any frame was sent',
    };
  } finally {
    try { ws.close(); } catch { /* best effort */ }
  }
}
