/**
 * Content identifiers, IPFS-compatible: CIDv1, sha2-256, rendered in base32 (the `b…` form IPFS
 * prints). Written out here rather than imported so the module has no dependencies; the encoding
 * is small and fixed. A test checks the output against `multiformats`.
 *
 *   cid = varint(1) varint(codec) varint(0x12) varint(32) <32-byte sha-256>
 */

/** Codecs the file layer uses: a chunk's raw bytes, and a file's manifest (JSON). */
export const RAW = 0x55;
export const JSON_CODEC = 0x0200;
const SHA2_256 = 0x12;

function varint(n: number): number[] {
  const out: number[] = [];
  while (n >= 0x80) { out.push((n & 0x7f) | 0x80); n >>>= 7; }
  out.push(n);
  return out;
}

function readVarint(bytes: Uint8Array, at: number): [number, number] {
  let n = 0, shift = 0;
  for (let i = at; i < bytes.length; i++) {
    n |= (bytes[i] & 0x7f) << shift;
    if (!(bytes[i] & 0x80)) return [n >>> 0, i + 1];
    shift += 7;
    if (shift > 28) break;
  }
  throw new Error('bad varint in CID');
}

const B32 = 'abcdefghijklmnopqrstuvwxyz234567';

function base32(bytes: Uint8Array): string {
  let out = '', bits = 0, value = 0;
  for (const b of bytes) {
    value = (value << 8) | b; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

function unbase32(s: string): Uint8Array {
  const out: number[] = [];
  let bits = 0, value = 0;
  for (const ch of s) {
    const v = B32.indexOf(ch);
    if (v < 0) throw new Error('bad base32 in CID');
    value = (value << 5) | v; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  return new Uint8Array(out);
}

/** A CID string for a sha-256 digest under `codec`. */
export function cidFor(codec: number, digest: Uint8Array): string {
  if (digest.length !== 32) throw new Error('a sha-256 digest is 32 bytes');
  const bytes = new Uint8Array([...varint(1), ...varint(codec), ...varint(SHA2_256), ...varint(32), ...digest]);
  return `b${base32(bytes)}`;
}

/** Codec and digest of a CID string this module made; throws for anything else. */
export function parseCid(cid: string): { codec: number; digest: Uint8Array } {
  if (!cid.startsWith('b')) throw new Error(`not a base32 CIDv1: ${cid}`);
  const bytes = unbase32(cid.slice(1));
  let at = 0, v: number;
  [v, at] = readVarint(bytes, at);
  if (v !== 1) throw new Error(`not a CIDv1: ${cid}`);
  let codec: number;
  [codec, at] = readVarint(bytes, at);
  let hash: number, len: number;
  [hash, at] = readVarint(bytes, at);
  [len, at] = readVarint(bytes, at);
  if (hash !== SHA2_256 || len !== 32 || bytes.length - at !== 32) throw new Error(`not a sha-256 CID: ${cid}`);
  return { codec, digest: bytes.subarray(at) };
}

export function isCid(s: string): boolean {
  try { parseCid(s); return true; } catch { return false; }
}
