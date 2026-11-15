/**
 * A standard IPFS block store (`interface-blockstore`) over a host's simple byte store: opaque
 * bytes under string keys, which is all a phone's file library or Node's file system needs to
 * supply. Keys are CIDs as strings. The host may keep its own bookkeeping under keys that are
 * not CIDs (starting with `_`); `getAll` skips them.
 */
import { NotFoundError, AbortError } from 'interface-store'
import { CID } from 'multiformats/cid'
import type { Blockstore, InputPair, Pair } from 'interface-blockstore'
import type { AbortOptions } from 'abort-error'

/** What a host supplies: bytes under string keys. */
export interface ByteStore {
  get(key: string): Promise<Uint8Array | null>
  put(key: string, bytes: Uint8Array): Promise<void>
  has(key: string): Promise<boolean>
  delete(key: string): Promise<void>
  keys(): Promise<string[]>
}

function checkAbort (options?: AbortOptions): void {
  if (options?.signal?.aborted === true) throw new AbortError('the operation was aborted')
}

async function collect (bytes: Uint8Array | Iterable<Uint8Array> | AsyncIterable<Uint8Array>): Promise<Uint8Array> {
  if (bytes instanceof Uint8Array) return bytes
  const parts: Uint8Array[] = []
  let n = 0
  for await (const p of bytes) { parts.push(p); n += p.length }
  const out = new Uint8Array(n)
  let at = 0
  for (const p of parts) { out.set(p, at); at += p.length }
  return out
}

export class KvBlockstore implements Blockstore {
  constructor (private readonly store: ByteStore) {}

  async has (cid: CID, options?: AbortOptions): Promise<boolean> {
    checkAbort(options)
    return this.store.has(cid.toString())
  }

  async put (cid: CID, bytes: Uint8Array | Iterable<Uint8Array> | AsyncIterable<Uint8Array>, options?: AbortOptions): Promise<CID> {
    checkAbort(options)
    await this.store.put(cid.toString(), await collect(bytes))
    return cid
  }

  async * putMany (source: Iterable<InputPair> | AsyncIterable<InputPair>, options?: AbortOptions): AsyncGenerator<CID> {
    for await (const { cid, bytes } of source) {
      checkAbort(options)
      yield this.put(cid, bytes, options)
    }
  }

  async * get (cid: CID, options?: AbortOptions): AsyncGenerator<Uint8Array> {
    checkAbort(options)
    const bytes = await this.store.get(cid.toString())
    if (bytes == null) throw new NotFoundError(`block ${cid.toString()} not found`)
    yield bytes
  }

  async * getMany (source: Iterable<CID> | AsyncIterable<CID>, options?: AbortOptions): AsyncGenerator<Pair> {
    for await (const cid of source) {
      checkAbort(options)
      // Read now, so a missing block fails here, not when the pair's bytes are consumed.
      const bytes = await this.store.get(cid.toString())
      if (bytes == null) throw new NotFoundError(`block ${cid.toString()} not found`)
      yield { cid, bytes: (async function * () { yield bytes })() }
    }
  }

  async * getAll (options?: AbortOptions): AsyncGenerator<Pair> {
    for (const key of await this.store.keys()) {
      checkAbort(options)
      let cid: CID
      try { cid = CID.parse(key) } catch { continue }
      const bytes = await this.store.get(key)
      if (bytes != null) yield { cid, bytes: (async function * () { yield bytes })() }
    }
  }

  async delete (cid: CID, options?: AbortOptions): Promise<void> {
    checkAbort(options)
    await this.store.delete(cid.toString())
  }

  async * deleteMany (source: Iterable<CID> | AsyncIterable<CID>, options?: AbortOptions): AsyncGenerator<CID> {
    for await (const cid of source) {
      checkAbort(options)
      await this.delete(cid, options)
      yield cid
    }
  }
}

/** A byte store in memory, for tests. */
export class MemoryByteStore implements ByteStore {
  private readonly map = new Map<string, Uint8Array>()
  async get (key: string): Promise<Uint8Array | null> { return this.map.get(key) ?? null }
  async put (key: string, bytes: Uint8Array): Promise<void> { this.map.set(key, bytes.slice()) }
  async has (key: string): Promise<boolean> { return this.map.has(key) }
  async delete (key: string): Promise<void> { this.map.delete(key) }
  async keys (): Promise<string[]> { return [...this.map.keys()] }
}
