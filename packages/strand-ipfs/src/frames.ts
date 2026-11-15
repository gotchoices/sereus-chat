/** Length-prefixed JSON frames over a libp2p 3 stream (u32 big-endian length, then UTF-8 JSON). */
import type { Stream } from '@libp2p/interface'

type Chunk = Uint8Array | { subarray(): Uint8Array }
const toBytes = (c: Chunk): Uint8Array => (c instanceof Uint8Array ? c : c.subarray())

export async function sendJson (stream: Stream, value: unknown): Promise<void> {
  const body = new TextEncoder().encode(JSON.stringify(value))
  const head = new Uint8Array(4)
  new DataView(head.buffer).setUint32(0, body.length, false)
  if (!stream.send(head)) await stream.onDrain()
  if (!stream.send(body)) await stream.onDrain()
}

/** Read one frame; `maxBytes` bounds it. */
export async function readJson<T> (stream: Stream, maxBytes: number): Promise<T> {
  const parts: Uint8Array[] = []
  let have = 0
  let need = -1
  for await (const chunk of stream as AsyncIterable<Chunk>) {
    const b = toBytes(chunk)
    parts.push(b); have += b.length
    if (need < 0 && have >= 4) {
      const all = concat(parts, have)
      need = new DataView(all.buffer, all.byteOffset, 4).getUint32(0, false)
      if (need > maxBytes) throw new Error(`frame of ${need} bytes over the ${maxBytes}-byte limit`)
    }
    if (need >= 0 && have >= 4 + need) {
      const all = concat(parts, have)
      return JSON.parse(new TextDecoder().decode(all.subarray(4, 4 + need))) as T
    }
  }
  throw new Error('stream ended before a whole frame')
}

function concat (parts: Uint8Array[], n: number): Uint8Array {
  if (parts.length === 1) return parts[0]
  const out = new Uint8Array(n)
  let at = 0
  for (const p of parts) { out.set(p, at); at += p.length }
  return out
}
