/**
 * SHA-256 for CIDs, natively where the platform has it (`crypto.subtle`: Node, browsers, and
 * React Native through the sereus kit's native digest). multiformats' own `sha256` resolves, on a
 * phone, to its Node build, whose `crypto` import becomes pure JavaScript there: seconds per MB
 * on an older phone. Pure JavaScript remains the fallback.
 */
import { from } from 'multiformats/hashes/hasher'
import { sha256 as portable } from 'multiformats/hashes/sha2'

type Subtle = { digest?(alg: string, data: Uint8Array): Promise<ArrayBuffer> }

export const sha256 = from({
  name: 'sha2-256',
  code: 0x12,
  encode: async (input: Uint8Array): Promise<Uint8Array<ArrayBuffer>> => {
    const subtle = (globalThis as { crypto?: { subtle?: Subtle } }).crypto?.subtle
    if (subtle?.digest != null) {
      try { return new Uint8Array(await subtle.digest('SHA-256', input)) } catch { /* fall back */ }
    }
    return new Uint8Array(await portable.encode(input))
  }
})
