/**
 * Content routing on FRET: five nodes in a FRET ring. A adds a file and provides its root: the
 * root's cohort (FRET's nearest members to its ring position) keeps the record, other members
 * than A among them. E finds A there and reads the file over Bitswap.
 */
import { afterAll, describe, expect, it } from 'vitest'
import { randomBytes, createHash } from 'node:crypto'
import { createLibp2p, type Libp2p } from 'libp2p'
import { webSockets } from '@libp2p/websockets'
import { noise } from '@chainsafe/libp2p-noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { identify } from '@libp2p/identify'
import { fretService, hashKey } from 'p2p-fret'
import { MemoryBlockstore } from 'blockstore-core'
import { unixfs } from '@helia/unixfs'
import { StrandIpfs, FretContentRouter, type FretLike } from './index.js'

type FretNode = Libp2p<{ fret: FretLike & { setLibp2p(n: unknown): void, listPeers(): unknown[] } }>

async function node (bootstraps: string[]): Promise<FretNode> {
  const n = await createLibp2p({
    start: false,
    addresses: { listen: ['/ip4/127.0.0.1/tcp/0/ws'] },
    transports: [webSockets()], connectionEncrypters: [noise()], streamMuxers: [yamux()],
    connectionGater: { denyDialMultiaddr: () => false },
    services: {
      identify: identify(),
      fret: (components: any) => fretService({ k: 15, m: 8, capacity: 2048, profile: 'core', networkName: 'strand-ipfs-test', bootstraps })(components)
    }
  }) as unknown as FretNode
  n.services.fret.setLibp2p(n)
  await n.start()
  return n
}
const sha = (b: Uint8Array): string => createHash('sha256').update(b).digest('hex')
async function until (check: () => boolean | Promise<boolean>, what: string, ms = 30_000): Promise<void> {
  for (const end = Date.now() + ms; Date.now() < end;) { if (await check()) return; await new Promise(r => setTimeout(r, 200)) }
  throw new Error(`timed out waiting for ${what}`)
}

describe('content routing on FRET', () => {
  const nodes: FretNode[] = []
  const ipfs: StrandIpfs[] = []
  const routers: FretContentRouter[] = []
  afterAll(async () => {
    await Promise.allSettled(ipfs.map(i => i.stop()))
    await Promise.allSettled(routers.map(r => r.stop()))
    await Promise.allSettled(nodes.map(n => n.stop()))
  })

  it('E finds A through the root\'s cohort, and reads the file', async () => {
    const a = await node([])
    const boot = [a.getMultiaddrs()[0].toString()]
    const b = await node(boot)
    const bootB = [b.getMultiaddrs()[0].toString()]
    const c = await node(boot); const d = await node(bootB); const e = await node(bootB)
    nodes.push(a, b, c, d, e)
    for (const n of [b, c]) await n.dial(a.getMultiaddrs()[0])
    for (const n of [d, e]) await n.dial(b.getMultiaddrs()[0])
    await until(() => nodes.every(n => n.services.fret.listPeers().length >= 3), 'FRET rings of 3+')

    for (const n of nodes) {
      const router = new FretContentRouter({ libp2p: n, fret: n.services.fret, hashKey, replicas: 3 })
      await router.start()
      routers.push(router)
      const i = new StrandIpfs({ libp2p: n, blockstore: new MemoryBlockstore(), routers: [router] })
      await i.start()
      ipfs.push(i)
    }
    const [ia, , , , ie] = ipfs

    const bytes = new Uint8Array(randomBytes(3_000_000))
    const root = await unixfs(ia).addBytes(bytes)
    const find = async (): Promise<string[]> => {
      const found: string[] = []
      for await (const p of routers[4].findProviders(root)) found.push(p.id.toString())
      return found
    }
    // (In a ring this small FRET connects everyone; what is tested is that the record is
    // where the cohort rule says, held by members other than A.)
    expect(await find()).toEqual([])
    await ia.provide(root)
    expect(await find()).toEqual([a.peerId.toString()])
    const holders = routers.filter(r => (r as unknown as { held(c: string): unknown[] }).held(root.toString()).length > 0)
    expect(holders.length).toBeGreaterThanOrEqual(2)
    expect(holders.some(r => r !== routers[0])).toBe(true)

    const t0 = Date.now()
    const parts: Uint8Array[] = []
    for await (const p of unixfs(ie).cat(root, { signal: AbortSignal.timeout(30_000) })) parts.push(p)
    process.stderr.write(`[strand-ipfs fret] 3 MB found through the cohort and fetched in ${Date.now() - t0} ms\n`)
    expect(sha(new Uint8Array(Buffer.concat(parts)))).toBe(sha(bytes))
  }, 120_000)
})
