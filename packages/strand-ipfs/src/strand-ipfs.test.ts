/**
 * IPFS on libp2p nodes it did not make: A adds a file with UnixFS; B, connected to A, reads it
 * back by CID over Bitswap; A's node keeps running after A's IPFS stops.
 */
import { afterAll, describe, expect, it } from 'vitest'
import { randomBytes, createHash } from 'node:crypto'
import { createLibp2p, type Libp2p } from 'libp2p'
import { webSockets } from '@libp2p/websockets'
import { noise } from '@chainsafe/libp2p-noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { identify } from '@libp2p/identify'
import { MemoryBlockstore } from 'blockstore-core'
import { unixfs } from '@helia/unixfs'
import { StrandIpfs } from './index.js'

async function node (): Promise<Libp2p> {
  return createLibp2p({
    addresses: { listen: ['/ip4/127.0.0.1/tcp/0/ws'] },
    transports: [webSockets()], connectionEncrypters: [noise()], streamMuxers: [yamux()],
    connectionGater: { denyDialMultiaddr: () => false },
    services: { identify: identify() }
  })
}
const sha = (b: Uint8Array): string => createHash('sha256').update(b).digest('hex')

describe('IPFS on an existing libp2p node', () => {
  const nodes: Libp2p[] = []
  const ipfs: StrandIpfs[] = []
  afterAll(async () => {
    await Promise.allSettled(ipfs.map(h => h.stop()))
    await Promise.allSettled(nodes.map(n => n.stop()))
  })

  it('B reads a file A added, over Bitswap', async () => {
    const [a, b] = await Promise.all([node(), node()])
    nodes.push(a, b)
    const ia = new StrandIpfs({ libp2p: a, blockstore: new MemoryBlockstore() })
    const ib = new StrandIpfs({ libp2p: b, blockstore: new MemoryBlockstore() })
    ipfs.push(ia, ib)
    await Promise.all([ia.start(), ib.start()])
    await b.dial(a.getMultiaddrs()[0])

    const bytes = new Uint8Array(randomBytes(2_300_123))
    const cid = await unixfs(ia).addBytes(bytes)
    const t0 = Date.now()
    const parts: Uint8Array[] = []
    for await (const p of unixfs(ib).cat(cid, { signal: AbortSignal.timeout(30_000) })) parts.push(p)
    process.stderr.write(`[strand-ipfs] 2.3 MB over bitswap in ${Date.now() - t0} ms, cid ${cid.toString()}\n`)
    expect(sha(new Uint8Array(Buffer.concat(parts)))).toBe(sha(bytes))
    expect(await ib.local.has(cid)).toBe(true)
    await ia.stop()
    expect(a.status).toBe('started')
  }, 60_000)
})
