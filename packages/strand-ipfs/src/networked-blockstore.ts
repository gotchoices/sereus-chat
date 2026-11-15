/**
 * A block store that reaches the strand: blocks found here come from here; others are asked of
 * the network (the block broker, Bitswap), checked against their CID, kept here, then given out.
 * Blocks put here are announced, so peers that want them hear of them. UnixFS and anything else
 * written against `interface-blockstore` reads and writes through it.
 */
import { equals } from 'uint8arrays/equals'
import type { BlockBroker } from '@helia/interface'
import type { Blockstore, InputPair, Pair } from 'interface-blockstore'
import type { AbortOptions } from 'abort-error'
import type { CID } from 'multiformats/cid'
import type { MultihashHasher } from 'multiformats/hashes/interface'

export interface NetworkedBlockstoreInit {
  local: Blockstore
  broker: () => BlockBroker | undefined
  getHasher: (code: number) => MultihashHasher | Promise<MultihashHasher>
  /** A block was put here (to provide it through routing). */
  onPut?: (cid: CID) => void
}

async function collect (bytes: Uint8Array | Iterable<Uint8Array> | AsyncIterable<Uint8Array>): Promise<Uint8Array> {
  if (bytes instanceof Uint8Array) return bytes
  const parts: Uint8Array[] = []
  let n = 0
  for await (const p of bytes) { parts.push(p); n += p.length }
  if (parts.length === 1) return parts[0]
  const out = new Uint8Array(n)
  let at = 0
  for (const p of parts) { out.set(p, at); at += p.length }
  return out
}

export class NetworkedBlockstore implements Blockstore {
  constructor (private readonly init: NetworkedBlockstoreInit) {}

  async has (cid: CID, options?: AbortOptions): Promise<boolean> {
    return this.init.local.has(cid, options)
  }

  async put (cid: CID, bytes: Uint8Array | Iterable<Uint8Array> | AsyncIterable<Uint8Array>, options?: AbortOptions): Promise<CID> {
    const block = await collect(bytes)
    await this.init.local.put(cid, block, options)
    await this.init.broker()?.announce?.(cid, options)
    this.init.onPut?.(cid)
    return cid
  }

  async * putMany (source: Iterable<InputPair> | AsyncIterable<InputPair>, options?: AbortOptions): AsyncGenerator<CID> {
    for await (const { cid, bytes } of source) yield this.put(cid, bytes, options)
  }

  async * get (cid: CID, options?: AbortOptions): AsyncGenerator<Uint8Array> {
    if (await this.init.local.has(cid, options)) {
      yield * this.init.local.get(cid, options)
      return
    }
    const broker = this.init.broker()
    if (broker?.retrieve == null) throw new Error(`block ${cid.toString()} is not here and there is no network to ask`)
    const block = await broker.retrieve(cid, options ?? {})
    // Whoever sent it, it must be the block the CID names.
    const hasher = await this.init.getHasher(cid.multihash.code)
    const digest = await hasher.digest(block)
    if (!equals(digest.digest, cid.multihash.digest)) throw new Error(`block ${cid.toString()} did not match its CID`)
    await this.init.local.put(cid, block, options)
    yield block
  }

  async * getMany (source: Iterable<CID> | AsyncIterable<CID>, options?: AbortOptions): AsyncGenerator<Pair> {
    for await (const cid of source) yield { cid, bytes: this.get(cid, options) }
  }

  async * getAll (options?: AbortOptions): AsyncGenerator<Pair> {
    yield * this.init.local.getAll(options)
  }

  async delete (cid: CID, options?: AbortOptions): Promise<void> {
    await this.init.local.delete(cid, options)
  }

  async * deleteMany (source: Iterable<CID> | AsyncIterable<CID>, options?: AbortOptions): AsyncGenerator<CID> {
    for await (const cid of source) { await this.delete(cid, options); yield cid }
  }
}
