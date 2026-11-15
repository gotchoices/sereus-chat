/**
 * Reading and writing the exchange's frames over a libp2p stream: exact-length reads from a
 * stream that arrives in arbitrary pieces, and sends that wait when the stream's buffer is full.
 */
import type { StreamChunk, StreamLike } from './types.js';

const toBytes = (c: StreamChunk): Uint8Array => (c instanceof Uint8Array ? c : c.subarray());

export class ByteReader {
  private readonly it: AsyncIterator<StreamChunk>;
  private parts: Uint8Array[] = [];
  private buffered = 0;

  constructor(stream: AsyncIterable<StreamChunk>) {
    this.it = stream[Symbol.asyncIterator]();
  }

  /** Exactly `n` bytes; throws if the stream ends first. */
  async read(n: number): Promise<Uint8Array> {
    while (this.buffered < n) {
      const next = await this.it.next();
      if (next.done) throw new Error(`stream ended after ${this.buffered} of ${n} bytes`);
      const b = toBytes(next.value);
      if (b.length) { this.parts.push(b); this.buffered += b.length; }
    }
    // One part holding all of it: no copy.
    if (this.parts[0].length >= n) {
      const head = this.parts[0];
      const out = head.subarray(0, n);
      if (head.length === n) this.parts.shift(); else this.parts[0] = head.subarray(n);
      this.buffered -= n;
      return out;
    }
    const out = new Uint8Array(n);
    let at = 0;
    while (at < n) {
      const head = this.parts[0];
      const take = Math.min(head.length, n - at);
      out.set(head.subarray(0, take), at);
      at += take;
      if (take === head.length) this.parts.shift(); else this.parts[0] = head.subarray(take);
    }
    this.buffered -= n;
    return out;
  }

  async u8(): Promise<number> { return (await this.read(1))[0]; }

  async u32(): Promise<number> {
    const b = await this.read(4);
    return new DataView(b.buffer, b.byteOffset, 4).getUint32(0, false);
  }
}

export function u32(n: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n, false);
  return b;
}

/** Send, waiting while the stream's buffer is full (libp2p 3 back-pressure). */
export async function send(stream: StreamLike, data: Uint8Array, signal?: AbortSignal): Promise<void> {
  if (!stream.send(data)) await stream.onDrain(signal ? { signal } : undefined);
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export async function sendJson(stream: StreamLike, value: unknown, signal?: AbortSignal): Promise<void> {
  const body = encoder.encode(JSON.stringify(value));
  await send(stream, u32(body.length), signal);
  await send(stream, body, signal);
}

export async function readJson<T>(reader: ByteReader, maxBytes: number): Promise<T> {
  const len = await reader.u32();
  if (len > maxBytes) throw new Error(`frame of ${len} bytes is over the ${maxBytes}-byte limit`);
  return JSON.parse(decoder.decode(await reader.read(len))) as T;
}
