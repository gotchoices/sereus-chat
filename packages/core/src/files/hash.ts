/**
 * SHA-256, natively where the platform has it (`crypto.subtle`: Node, browsers, and React Native
 * through the sereus kit's native digest), else pure JavaScript. Pure JavaScript on a phone is
 * slow (19 s per MB on a Galaxy S7, measured for chat's chunk store), so the native path matters.
 */
import { sha256 as nobleSha256 } from '@noble/hashes/sha2.js';

type Subtle = { digest?(alg: string, data: Uint8Array): Promise<ArrayBuffer> };

export async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  const subtle = (globalThis as { crypto?: { subtle?: Subtle } }).crypto?.subtle;
  if (subtle?.digest) {
    try { return new Uint8Array(await subtle.digest('SHA-256', bytes)); } catch { /* fall back */ }
  }
  return nobleSha256(bytes);
}

export function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
