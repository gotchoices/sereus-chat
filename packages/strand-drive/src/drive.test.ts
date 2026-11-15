/**
 * A strand's shared drive over real libp2p on loopback. The strand record holding the root is
 * simulated by one shared value (in chat it would be a strand table row, replicated by the
 * database). A builds a tree; B lists it and reads a photo over the network; B adds a file and A
 * sees it; A's gc keeps everything the current tree uses.
 */
import { afterAll, describe, expect, it } from 'vitest'
import { randomBytes, createHash } from 'node:crypto'
import { createLibp2p, type Libp2p } from 'libp2p'
import { webSockets } from '@libp2p/websockets'
import { noise } from '@chainsafe/libp2p-noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { identify } from '@libp2p/identify'
import { StrandIpfs, KvBlockstore, MemoryByteStore } from '@chat/strand-ipfs'
import { StrandBlobs } from '@chat/strand-blobs'
import { StrandDrive, type DriveRoot } from './index.js'

const nodes: Libp2p[] = []
const ipfsNodes: StrandIpfs[] = []
afterAll(async () => {
  await Promise.allSettled(ipfsNodes.map(i => i.stop()))
  await Promise.allSettled(nodes.map(n => n.stop()))
})

async function node (): Promise<Libp2p> {
  const n = await createLibp2p({
    addresses: { listen: ['/ip4/127.0.0.1/tcp/0/ws'] },
    transports: [webSockets()], connectionEncrypters: [noise()], streamMuxers: [yamux()],
    connectionGater: { denyDialMultiaddr: () => false },
    services: { identify: identify() }
  })
  nodes.push(n)
  return n
}

async function member (scope: string, root: DriveRoot): Promise<{ libp2p: Libp2p, drive: StrandDrive, blobs: StrandBlobs, bytes: MemoryByteStore }> {
  const bytes = new MemoryByteStore()
  const blockstore = new KvBlockstore(bytes)
  const blobs = new StrandBlobs({ blockstore, index: bytes })
  const libp2p = await node()
  const ipfs = new StrandIpfs({ libp2p, blockstore, servable: cid => blobs.servable(scope, cid) })
  await ipfs.start()
  ipfsNodes.push(ipfs)
  await blobs.attach(scope, ipfs)
  return { libp2p, drive: new StrandDrive({ scope, blockstore: () => ipfs.blockstore, blobs, root }), blobs, bytes }
}

const sha = (b: Uint8Array): string => createHash('sha256').update(b).digest('hex')
async function all (source: AsyncIterable<Uint8Array>): Promise<Uint8Array> {
  const parts: Uint8Array[] = []
  for await (const p of source) parts.push(p)
  return new Uint8Array(Buffer.concat(parts))
}

describe('a strand drive', () => {
  it('two members share a tree through a root kept in the strand', async () => {
    // The strand's record of the root, as both members see it.
    let shared: string | null = null
    const saves: string[] = []
    const root: DriveRoot = { load: async () => shared, save: async (cid) => { shared = cid; saves.push(cid) } }

    const a = await member('s1', root)
    const b = await member('s1', root)
    await b.libp2p.dial(a.libp2p.getMultiaddrs()[0])

    const photo = new Uint8Array(randomBytes(2_500_000))
    await a.drive.mkdir('/photos')
    await a.drive.writeBytes('/photos/a.jpg', photo)
    await a.drive.writeBytes('/notes.txt', new TextEncoder().encode('hello drive'))
    expect(saves.length).toBeGreaterThanOrEqual(3)

    // B: the tree A built, read over the network.
    const top: string[] = []
    for await (const e of b.drive.ls('/')) top.push(e.name)
    expect(top.sort()).toEqual(['notes.txt', 'photos'])
    expect(sha(await all(b.drive.cat('/photos/a.jpg')))).toBe(sha(photo))
    expect(new TextDecoder().decode(await all(b.drive.cat('/notes.txt')))).toBe('hello drive')

    // B adds a file; A, starting from the root the strand has now, sees both.
    await b.drive.writeBytes('/photos/b.jpg', new Uint8Array(randomBytes(300_000)))
    const photos: string[] = []
    for await (const e of a.drive.ls('/photos')) photos.push(e.name)
    expect(photos.sort()).toEqual(['a.jpg', 'b.jpg'])

    // A's gc: old roots go, everything the current tree uses stays.
    const removed = await a.blobs.gc(Date.now() + 1000)
    expect(removed.files).toBeGreaterThan(0)
    expect(sha(await all(a.drive.cat('/photos/a.jpg')))).toBe(sha(photo))
  }, 90_000)
})
