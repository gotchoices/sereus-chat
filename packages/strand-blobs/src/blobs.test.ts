/**
 * Blobs on IPFS-on-a-strand, over real libp2p nodes on loopback: a file put on A reaches B whole
 * and identical; strands are kept apart; announcements fetch up to the receiver's limit; a
 * transfer cut off resumes; a file put while alone waits in the outbox until a member holds it;
 * both away and back together (A's app restarted) still crosses; leases decide what gc keeps;
 * a file of raw leaves is joined natively when the host can.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { randomBytes, createHash } from 'node:crypto'
import { createLibp2p, type Libp2p } from 'libp2p'
import { webSockets } from '@libp2p/websockets'
import { noise } from '@chainsafe/libp2p-noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { identify } from '@libp2p/identify'
import { CID } from 'multiformats/cid'
import { StrandIpfs, KvBlockstore, MemoryByteStore } from '@chat/strand-ipfs'
import { StrandBlobs, NotAvailableError, type StrandBlobsInit } from './index.js'

const nodes: Libp2p[] = []
const ipfsNodes: StrandIpfs[] = []
afterEach(async () => {
  await Promise.allSettled(ipfsNodes.splice(0).map(i => i.stop()))
  await Promise.allSettled(nodes.splice(0).map(n => n.stop()))
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

/** A device: its byte store and block store, its blobs, and a strand node per scope. */
class Device {
  readonly bytes: MemoryByteStore
  readonly blockstore: KvBlockstore
  blobs: StrandBlobs
  constructor (init: Partial<StrandBlobsInit> = {}, bytes = new MemoryByteStore()) {
    this.bytes = bytes
    this.blockstore = new KvBlockstore(bytes)
    this.blobs = new StrandBlobs({ blockstore: this.blockstore, index: bytes, ...init })
  }

  /** Restart the app: a new blobs layer over the same stores. */
  restart (init: Partial<StrandBlobsInit> = {}): void {
    this.blobs = new StrandBlobs({ blockstore: this.blockstore, index: this.bytes, ...init })
  }

  async join (scope: string, libp2p?: Libp2p): Promise<Libp2p> {
    const n = libp2p ?? await node()
    const ipfs = new StrandIpfs({ libp2p: n, blockstore: this.blockstore, servable: cid => this.blobs.servable(scope, cid) })
    await ipfs.start()
    ipfsNodes.push(ipfs)
    await this.blobs.attach(scope, ipfs)
    return n
  }
}

async function * once (bytes: Uint8Array): AsyncGenerator<Uint8Array> { yield bytes }
const sha = (b: Uint8Array): string => createHash('sha256').update(b).digest('hex')
async function bytesOf (d: Device, scope: string, cid: string): Promise<Uint8Array> {
  const parts: Uint8Array[] = []
  for await (const p of d.blobs.read(scope, cid)) parts.push(p)
  return new Uint8Array(Buffer.concat(parts))
}
async function until (check: () => boolean | Promise<boolean>, what: string, ms = 20_000): Promise<void> {
  for (const end = Date.now() + ms; Date.now() < end;) { if (await check()) return; await new Promise(r => setTimeout(r, 100)) }
  throw new Error(`timed out waiting for ${what}`)
}

describe('strand blobs', () => {
  it('a file put on A reaches B whole and identical', async () => {
    const a = new Device(); const b = new Device()
    const na = await a.join('s1'); const nb = await b.join('s1')
    await nb.dial(na.getMultiaddrs()[0])
    const bytes = new Uint8Array(randomBytes(2_600_000))
    const { cid, size } = await a.blobs.put('s1', once(bytes))
    expect(size).toBe(bytes.length)
    expect(cid).toMatch(/^bafy/)   // a UnixFS root (dag-pb), CIDv1
    const t0 = Date.now()
    await b.blobs.fetch('s1', cid)
    process.stderr.write(`[strand-blobs] 2.6 MB fetched in ${Date.now() - t0} ms\n`)
    expect(sha(await bytesOf(b, 's1', cid))).toBe(sha(bytes))
    expect((await b.blobs.status(cid))?.here).toBe(true)
  }, 60_000)

  it("serves a strand's files only in that strand", async () => {
    const a = new Device(); const b = new Device()
    const na = await a.join('s1'); const nb = await b.join('s1')
    await nb.dial(na.getMultiaddrs()[0])
    const { cid } = await a.blobs.put('s2', once(new Uint8Array(randomBytes(50_000))))
    await expect(b.blobs.fetch('s1', cid, { timeoutMs: 3000 })).rejects.toBeInstanceOf(NotAvailableError)
  }, 60_000)

  it('announced files are fetched up to the receiver\'s limit, and the sender sees them placed', async () => {
    const placed: string[] = []
    const a = new Device({ onPlaced: (_s, cid) => placed.push(cid) })
    const b = new Device({ onAnnounce: () => 1_000_000 })
    const na = await a.join('s1'); const nb = await b.join('s1')
    await nb.dial(na.getMultiaddrs()[0])
    const small = await a.blobs.put('s1', once(new Uint8Array(randomBytes(600_000))))
    const big = await a.blobs.put('s1', once(new Uint8Array(randomBytes(1_500_000))))
    await until(() => b.blobs.has(small.cid), 'the small file at B')
    await until(() => placed.includes(small.cid), 'A told it is placed')
    await new Promise(r => setTimeout(r, 1000))
    expect(await b.blobs.has(big.cid)).toBe(false)
    expect(a.blobs.outbox('s1')).toEqual([big.cid])
  }, 60_000)

  it('a transfer cut off mid-way resumes, fetching only the rest', async () => {
    const a = new Device(); const b = new Device()
    const na = await a.join('s1'); const nb = await b.join('s1')
    await nb.dial(na.getMultiaddrs()[0])
    const bytes = new Uint8Array(randomBytes(8 * 1_048_576))
    const { cid } = await a.blobs.put('s1', once(bytes))
    // B fetches; A goes away once part of it has crossed.
    const fetching = b.blobs.fetch('s1', cid, { timeoutMs: 8000 }).catch((e: unknown) => e)
    await until(async () => (await b.bytes.keys()).length >= 3, 'a few blocks at B')
    await na.stop()
    expect(await fetching).toBeInstanceOf(NotAvailableError)
    const partial = (await b.bytes.keys()).filter(k => k.startsWith('b')).length
    expect(partial).toBeGreaterThan(0)
    // A comes back on a new node, the same blocks.
    const na2 = await a.join('s1')
    await nb.dial(na2.getMultiaddrs()[0])
    await b.blobs.fetch('s1', cid)
    expect(sha(await bytesOf(b, 's1', cid))).toBe(sha(bytes))
  }, 90_000)

  it('a file put while alone waits in the outbox, and is placed when a member connects', async () => {
    const placed: string[] = []
    const a = new Device({ onPlaced: (_s, cid) => placed.push(cid) })
    const b = new Device({ onAnnounce: () => 10_000_000 })
    const na = await a.join('s1')
    const { cid } = await a.blobs.put('s1', once(new Uint8Array(randomBytes(700_000))))
    expect(a.blobs.outbox('s1')).toEqual([cid])
    const nb = await b.join('s1')
    await nb.dial(na.getMultiaddrs()[0])
    await until(() => b.blobs.has(cid), 'the file at B')
    await until(() => placed.includes(cid), 'A told it is placed')
    expect(a.blobs.outbox('s1')).toEqual([])
  }, 60_000)

  it("both away and back together, A's app restarted: the file still crosses", async () => {
    const a = new Device()
    const b = new Device({ onAnnounce: () => 10_000_000 })
    const na = await a.join('s1')
    const bytes = new Uint8Array(randomBytes(900_000))
    const { cid } = await a.blobs.put('s1', once(bytes))   // B is away
    await na.stop()                                         // and now A is away too
    const placed: string[] = []
    a.restart({ onPlaced: (_s, c) => placed.push(c) })
    const [na2, nb] = await Promise.all([a.join('s1'), b.join('s1')])
    await nb.dial(na2.getMultiaddrs()[0])
    await until(() => b.blobs.has(cid), 'the file at B')
    expect(sha(await bytesOf(b, 's1', cid))).toBe(sha(bytes))
    await until(() => placed.includes(cid), 'A told it is placed')
  }, 60_000)

  it('keeps leased files and collects expired ones, and the index survives a restart', async () => {
    const d = new Device({ leaseMs: 1000 })
    const kept = await d.blobs.put('s1', once(new Uint8Array(randomBytes(300_000))))
    const dropped = await d.blobs.put('s1', once(new Uint8Array(randomBytes(300_000))))
    await d.blobs.touch(kept.cid, 60_000)
    const removed = await d.blobs.gc(Date.now() + 5000)
    expect(removed.files).toBe(1)
    expect(await d.blockstore.has(CID.parse(dropped.cid))).toBe(false)
    d.restart()
    expect(await d.blobs.has(kept.cid)).toBe(true)
    expect(await d.blobs.has(dropped.cid)).toBe(false)
  }, 30_000)

  it('joins a file of raw leaves natively when the host can', async () => {
    const joined: Uint8Array[] = []
    const d = new Device({
      assemble: async (keys) => { for (const k of keys) joined.push((await d.bytes.get(k))!) }
    })
    const bytes = new Uint8Array(randomBytes(2_500_000))
    const { cid } = await d.blobs.put('s1', once(bytes))
    expect(await d.blobs.saveAs('s1', cid, '/ignored')).toBe(true)
    expect(sha(new Uint8Array(Buffer.concat(joined)))).toBe(sha(bytes))
  }, 30_000)
})
