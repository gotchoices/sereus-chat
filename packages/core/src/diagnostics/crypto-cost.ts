/**
 * Where do the seconds go in a dial on this runtime? The primitives a connection pays for,
 * measured with no network in the way, so one runtime's figures can be read against
 * another's (the ratio is the point, not the absolute numbers).
 *
 *   x25519        one Diffie-Hellman; a Noise XX handshake does about four
 *   ed25519       sign and verify in pure JavaScript (@noble/curves)
 *   ed25519 (WebCrypto)  the same through `crypto.subtle` when the runtime has it — what
 *                 libp2p actually uses once a native Ed25519 is installed (the phone kit's
 *                 `/polyfills/native-crypto`)
 *   chacha/sha    per-frame symmetric cost at a realistic frame size; a bring-up sends
 *                 about 7,000 frames
 *   ws.send       not crypto: handing one frame to the runtime's WebSocket
 *
 * Throwaway keys, at most one socket; touches no strand and no app data.
 * History: on a Galaxy S7 under Hermes, pure-JS ed25519 verify took 169 ms against 0.72 ms
 * native; that is what moved the phone to native Ed25519 (sereus#33).
 */
import { ed25519, x25519 } from '@noble/curves/ed25519.js';
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

export type CostReport = { measurements: Measurement[]; notes: string[] };

/** Frames observed during a bring-up in Node, for scaling the per-frame costs. */
export const BRINGUP_FRAMES = 7000;
/** Noise XX performs several DH operations per handshake. */
const DH_PER_HANDSHAKE = 4;
/** Representative frame payload; strand traffic is mostly small records. */
const FRAME_BYTES = 512;

/** A sub-millisecond clock where the runtime has one (`performance` is not a global everywhere). */
const perf = (globalThis as { performance?: { now(): number } }).performance;
const now = () => (perf ? perf.now() : Date.now());

/** Time `fn` over `iterations`, after one warm-up pass, yielding first so a UI can paint. */
async function timed(iterations: number, fn: () => unknown | Promise<unknown>): Promise<number> {
  await fn(); // lazily compiled engines pay for the first call through a path once
  await new Promise<void>(r => setTimeout(() => r(), 0));
  const t0 = now();
  for (let i = 0; i < iterations; i += 1) await fn();
  return (now() - t0) / iterations;
}

/** The runtime's WebCrypto Ed25519, or null when it has none. */
async function webCryptoEd25519(): Promise<{ sign(): Promise<unknown>; verify(): Promise<unknown> } | null> {
  const subtle = (globalThis as { crypto?: { subtle?: SubtleLike } }).crypto?.subtle;
  if (!subtle) return null;
  try {
    const pair = await subtle.generateKey({ name: 'Ed25519' }, false, ['sign', 'verify']);
    const msg = new Uint8Array(64).fill(7);
    const sig = await subtle.sign({ name: 'Ed25519' }, pair.privateKey, msg);
    return {
      sign: () => subtle.sign({ name: 'Ed25519' }, pair.privateKey, msg),
      verify: () => subtle.verify({ name: 'Ed25519' }, pair.publicKey, sig, msg),
    };
  } catch {
    return null;
  }
}

type SubtleLike = {
  generateKey(alg: { name: string }, extractable: boolean, usages: string[]): Promise<{ privateKey: unknown; publicKey: unknown }>;
  sign(alg: { name: string }, key: unknown, data: Uint8Array): Promise<unknown>;
  verify(alg: { name: string }, key: unknown, sig: unknown, data: Uint8Array): Promise<boolean>;
};

export async function runCryptoCost(onProgress?: (line: string) => void): Promise<CostReport> {
  const say = (l: string) => onProgress?.(l);
  const measurements: Measurement[] = [];
  const notes: string[] = [];

  say('x25519 Diffie-Hellman…');
  const aPriv = x25519.utils.randomSecretKey();
  const bPub = x25519.getPublicKey(x25519.utils.randomSecretKey());
  const dhMs = await timed(20, () => x25519.getSharedSecret(aPriv, bPub));
  measurements.push({
    label: 'x25519 shared secret', msPerOp: dhMs, iterations: 20,
    implication: `~${Math.round(dhMs * DH_PER_HANDSHAKE)} ms of crypto per Noise handshake`,
  });

  say('ed25519 sign/verify (pure JS)…');
  const edPriv = ed25519.utils.randomSecretKey();
  const edPub = ed25519.getPublicKey(edPriv);
  const msg = new Uint8Array(64).fill(7);
  const sig = ed25519.sign(msg, edPriv);
  measurements.push({ label: 'ed25519 sign (JS)', msPerOp: await timed(20, () => ed25519.sign(msg, edPriv)), iterations: 20 });
  measurements.push({ label: 'ed25519 verify (JS)', msPerOp: await timed(20, () => ed25519.verify(sig, msg, edPub)), iterations: 20 });

  say('ed25519 sign/verify (WebCrypto)…');
  const native = await webCryptoEd25519();
  if (native) {
    measurements.push({ label: 'ed25519 sign (WebCrypto)', msPerOp: await timed(20, () => native.sign()), iterations: 20 });
    measurements.push({ label: 'ed25519 verify (WebCrypto)', msPerOp: await timed(20, () => native.verify()), iterations: 20 });
  } else {
    notes.push('No WebCrypto Ed25519 here: libp2p signs and verifies in pure JS.');
  }

  say('chacha20-poly1305 + sha256 per frame…');
  const key = new Uint8Array(32).fill(3);
  const nonce = new Uint8Array(12).fill(5);
  const payload = new Uint8Array(FRAME_BYTES).fill(9);
  const aeadMs = await timed(200, () => chacha20poly1305(key, nonce).encrypt(payload));
  const shaMs = await timed(200, () => sha256(payload));
  const atScale = (ms: number) => `~${(ms * BRINGUP_FRAMES / 1000).toFixed(1)} s across a ${BRINGUP_FRAMES}-frame bring-up`;
  measurements.push({ label: `chacha20-poly1305 seal (${FRAME_BYTES} B)`, msPerOp: aeadMs, iterations: 200, implication: atScale(aeadMs) });
  measurements.push({ label: `sha256 (${FRAME_BYTES} B)`, msPerOp: shaMs, iterations: 200, implication: atScale(shaMs) });

  notes.push(`Noise handshake crypto floor: ~${Math.round(dhMs * DH_PER_HANDSHAKE)} ms per connection.`);
  notes.push(`Per-frame symmetric cost × ${BRINGUP_FRAMES} frames: ~${((aeadMs + shaMs) * BRINGUP_FRAMES / 1000).toFixed(1)} s of pure CPU.`);
  return { measurements, notes };
}

/**
 * The non-crypto half: what handing ONE frame to the runtime's WebSocket costs. `send()` is
 * fire-and-forget into native code, so this times the JavaScript side only — the per-frame
 * tax libp2p pays thousands of times. A libp2p relay closes a raw socket that fails
 * multistream negotiation, so a close part-way is a result, not an error.
 */
export async function runSocketFrameCost(wsUrl: string, frames = 200, onProgress?: (line: string) => void): Promise<Measurement> {
  onProgress?.(`opening ${wsUrl}…`);
  const WS = (globalThis as { WebSocket?: new (url: string) => SocketLike }).WebSocket;
  if (!WS) throw new Error('this runtime has no WebSocket');
  const ws = new WS(wsUrl);
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('socket did not open within 10 s')), 10_000);
    ws.onopen = () => { clearTimeout(timer); resolve(); };
    ws.onerror = () => { clearTimeout(timer); reject(new Error('socket error before open')); };
  });
  try {
    const payload = new Uint8Array(FRAME_BYTES).fill(1);
    const t0 = now();
    let sent = 0;
    for (let i = 0; i < frames; i += 1) {
      if (ws.readyState !== 1) break;
      ws.send(payload);
      sent += 1;
    }
    const msPerOp = sent > 0 ? (now() - t0) / sent : Number.NaN;
    return {
      label: `WebSocket.send (${FRAME_BYTES} B)`, msPerOp, iterations: sent,
      implication: Number.isFinite(msPerOp) ? `~${(msPerOp * BRINGUP_FRAMES / 1000).toFixed(1)} s across a ${BRINGUP_FRAMES}-frame bring-up` : 'socket closed before any frame was sent',
    };
  } finally {
    try { ws.close(); } catch { /* best effort */ }
  }
}

type SocketLike = { readyState: number; onopen: (() => void) | null; onerror: (() => void) | null; send(data: Uint8Array): void; close(): void };
