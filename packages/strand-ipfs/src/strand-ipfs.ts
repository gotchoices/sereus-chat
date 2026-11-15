/**
 * IPFS on a strand, without Helia's own libp2p bundle: the strand's libp2p node (cadre's, used
 * but never started or stopped here), Helia's Bitswap for the exchange, a networked block store
 * that UnixFS (or anything written against `interface-blockstore`) reads and writes through, and
 * content routers (FRET's) for finding who holds a CID.
 *
 * `helia` itself is not used: importing it brings its default libp2p stack (a Kademlia DHT,
 * auto-TLS, a keychain and a second @libp2p/crypto), which a phone must not carry. Bitswap
 * attaches to any object with Helia's mixin and block-broker hooks, which this provides.
 *
 * One `StrandIpfs` per strand node: when a strand wakes on a new node, stop this one and make
 * another over the same local block store.
 */
import { withBitswap, type BitswapOptions } from '@helia/bitswap'
import { defaultLogger } from '@libp2p/logger'
import { sha256 } from 'multiformats/hashes/sha2'
import { identity } from 'multiformats/hashes/identity'
import { NetworkedBlockstore } from './networked-blockstore.js'
import type { BlockBroker, Routing, Provider } from '@helia/interface'
import type { Libp2p, ComponentLogger } from '@libp2p/interface'
import type { Blockstore } from 'interface-blockstore'
import type { CID } from 'multiformats/cid'
import type { MultihashHasher } from 'multiformats/hashes/interface'
import type { AbortOptions } from 'abort-error'

/** What a content router supplies (Helia's `Router`, the parts used here). */
export interface ContentRouter {
  name: string
  /** Say this node holds `cid`. */
  provide?(cid: CID, options?: AbortOptions): Promise<void>
  /** Who holds `cid`. */
  findProviders?(cid: CID, options?: AbortOptions): AsyncIterable<Provider>
}

export interface StrandIpfsInit {
  /** The strand's libp2p node: used, never started or stopped here. */
  libp2p: Libp2p
  /** This device's blocks. */
  blockstore: Blockstore
  routers?: ContentRouter[]
  bitswap?: BitswapOptions
  logger?: ComponentLogger
  /**
   * May this peer use the exchange? (The strand's membership check.) Every protocol Bitswap
   * serves is behind it: an inbound stream from a peer it refuses is closed before Bitswap
   * reads it. Default: anyone the node is connected to.
   */
  authorize?: (peerId: string) => boolean | Promise<boolean>
}

/**
 * The node as Bitswap sees it: the same node, except that a protocol handler registered through
 * it answers only peers `authorize` admits.
 */
function gated (libp2p: Libp2p, authorize?: (peerId: string) => boolean | Promise<boolean>): Libp2p {
  if (authorize == null) return libp2p
  return new Proxy(libp2p, {
    get (target, prop) {
      if (prop === 'handle') {
        return async (protocol: string | string[], handler: (stream: any, connection: any) => void | Promise<void>, options?: unknown) =>
          target.handle(protocol, async (stream, connection) => {
            let ok = false
            try { ok = (await authorize(connection.remotePeer.toString())) === true } catch { ok = false }
            if (!ok) { stream.abort(new Error('not authorized')); return }
            await handler(stream, connection)
          }, options as never)
      }
      const value = Reflect.get(target, prop, target)
      return typeof value === 'function' ? value.bind(target) : value
    }
  })
}

interface Mixin { name: string, start?(helia: unknown): Promise<void> | void, stop?(helia: unknown): Promise<void> | void }

export class StrandIpfs {
  readonly libp2p: Libp2p
  /** What Bitswap is given: the node, with its handlers behind `authorize`. */
  private readonly served: Libp2p
  /** Read and write blocks through this: misses are fetched from the strand. */
  readonly blockstore: NetworkedBlockstore
  readonly local: Blockstore
  private readonly routers: ContentRouter[]
  private readonly logger: ComponentLogger
  private readonly mixins: Mixin[] = []
  private readonly brokers: BlockBroker[] = []
  private status: 'stopped' | 'starting' | 'started' | 'stopping' = 'stopped'

  constructor (init: StrandIpfsInit) {
    this.libp2p = init.libp2p
    this.served = gated(init.libp2p, init.authorize)
    this.local = init.blockstore
    this.routers = init.routers ?? []
    this.logger = init.logger ?? defaultLogger()
    this.blockstore = new NetworkedBlockstore({
      local: init.blockstore,
      broker: () => this.brokers[0],
      getHasher: code => this.getHasher(code),
    })
    // Bitswap's block broker, attached through Helia's mixin hooks.
    withBitswap(this.heliaLike() as never, init.bitswap)
  }

  async start (): Promise<void> {
    if (this.status !== 'stopped') return
    this.status = 'starting'
    for (const m of this.mixins) await m.start?.(this.heliaLike())
    for (const b of this.brokers) await (b as { start?(): Promise<void> }).start?.()
    this.status = 'started'
  }

  async stop (): Promise<void> {
    if (this.status !== 'started') return
    this.status = 'stopping'
    for (const b of this.brokers) await (b as { stop?(): Promise<void> }).stop?.()
    for (const m of this.mixins) await m.stop?.(this.heliaLike())
    this.brokers.length = 0
    this.status = 'stopped'
  }

  /**
   * Tell the routers this node holds `cid`: call it for a file's root, not every block (Bitswap
   * fetches a file's blocks from whoever served its root).
   */
  async provide (cid: CID, options?: AbortOptions): Promise<void> {
    await Promise.allSettled(this.routers.map(async r => r.provide?.(cid, options)))
  }

  getHasher (code: number): MultihashHasher {
    if (code === sha256.code) return sha256
    if (code === identity.code) return identity as unknown as MultihashHasher
    throw new Error(`no hasher for multihash code 0x${code.toString(16)}`)
  }

  /** Content routing over every router: who holds a CID. */
  private readonly routing: Pick<Routing, 'findProviders' | 'provide'> = {
    findProviders: (cid: CID, options?: AbortOptions) => this.findProviders(cid, options),
    provide: async (cid: CID, options?: AbortOptions) => this.provide(cid, options)
  }

  private async * findProviders (cid: CID, options?: AbortOptions): AsyncGenerator<Provider> {
    for (const r of this.routers) {
      if (r.findProviders == null) continue
      try { yield * r.findProviders(cid, options) } catch { /* the next router */ }
    }
  }

  /** The Helia surface Bitswap reads (components) and attaches to (mixins, block brokers). */
  private heliaLike (): Record<string, unknown> {
    return {
      status: this.status,
      libp2p: this.served,
      blockstore: this.local,
      routing: this.routing,
      logger: this.logger,
      getHasher: (code: number) => this.getHasher(code),
      addMixin: (m: Mixin) => { this.mixins.push(m) },
      hasBlockBroker: (name: string) => this.brokers.some(b => b.name === name),
      addBlockBroker: (b: BlockBroker) => { this.brokers.push(b) }
    }
  }
}
