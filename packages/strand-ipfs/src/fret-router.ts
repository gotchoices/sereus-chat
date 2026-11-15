/**
 * Content routing on FRET: who holds a CID. A CID's ring position is FRET's hash of its
 * multihash; the cohort nearest that position (FRET's `assembleCohort`, the rule Optimystic uses
 * to place blocks) keeps provider records for it. `provide` hands a record to each cohort member;
 * `findProviders` asks them. Records expire unless provided again (`reprovide` in StrandIpfs).
 *
 * FRET's own activity handler is single (and Optimystic's), so records travel on a small
 * protocol of this package's, dialled to the cohort members FRET names.
 */
import { peerIdFromString } from '@libp2p/peer-id'
import { multiaddr } from '@multiformats/multiaddr'
import { CID } from 'multiformats/cid'
import { readJson, sendJson } from './frames.js'
import type { ContentRouter } from './strand-ipfs.js'
import type { Provider } from '@helia/interface'
import type { Libp2p, Stream, Connection } from '@libp2p/interface'
import type { AbortOptions } from 'abort-error'

export const PROVIDERS_PROTOCOL = '/sereus/ipfs/providers/1.0.0'

/** The parts of FRET used here. */
export interface FretLike {
  assembleCohort(coord: Uint8Array, wants: number, exclude?: Set<string>): string[]
}

export interface FretRouterInit {
  libp2p: Libp2p
  fret: FretLike
  /** FRET's ring hash (`hashKey` from p2p-fret). */
  hashKey: (key: Uint8Array) => Promise<Uint8Array>
  /** Cohort members that keep each record. */
  replicas?: number
  /** How long a record lasts without being provided again. */
  recordTtlMs?: number
  /** May this peer use the protocol? (The strand's membership check.) Default: anyone. */
  authorize?: (peerId: string) => boolean | Promise<boolean>
}

interface Record { addrs: string[], expires: number }
type Request = { op: 'add', cid: string, addrs: string[] } | { op: 'get', cid: string }

export class FretContentRouter implements ContentRouter {
  readonly name = 'fret'
  private readonly init: FretRouterInit
  private readonly records = new Map<string, Map<string, Record>>()
  private readonly replicas: number
  private readonly ttl: number

  constructor (init: FretRouterInit) {
    this.init = init
    this.replicas = init.replicas ?? 3
    this.ttl = init.recordTtlMs ?? 24 * 60 * 60 * 1000
  }

  async start (): Promise<void> {
    await this.init.libp2p.handle(PROVIDERS_PROTOCOL, (stream, connection) => {
      void this.answer(stream, connection)
    }, { runOnLimitedConnection: true })
  }

  async stop (): Promise<void> {
    await this.init.libp2p.unhandle(PROVIDERS_PROTOCOL)
  }

  private async cohort (cid: CID): Promise<string[]> {
    const coord = await this.init.hashKey(cid.multihash.bytes)
    return this.init.fret.assembleCohort(coord, this.replicas)
  }

  private keep (cid: string, peer: string, addrs: string[]): void {
    const forCid = this.records.get(cid) ?? this.records.set(cid, new Map()).get(cid)!
    forCid.set(peer, { addrs, expires: Date.now() + this.ttl })
  }

  private held (cid: string): Array<{ id: string, addrs: string[] }> {
    const forCid = this.records.get(cid)
    if (forCid == null) return []
    const now = Date.now()
    const out: Array<{ id: string, addrs: string[] }> = []
    for (const [id, r] of forCid) {
      if (r.expires < now) forCid.delete(id)
      else out.push({ id, addrs: r.addrs })
    }
    return out
  }

  async provide (cid: CID, options?: AbortOptions): Promise<void> {
    const self = this.init.libp2p.peerId.toString()
    const addrs = this.init.libp2p.getMultiaddrs().map(m => m.toString())
    const key = cid.toString()
    const cohort = await this.cohort(cid)
    await Promise.allSettled(cohort.map(async peer => {
      if (peer === self) { this.keep(key, self, addrs); return }
      await this.request(peer, { op: 'add', cid: key, addrs }, options)
    }))
  }

  async * findProviders (cid: CID, options?: AbortOptions): AsyncGenerator<Provider> {
    const self = this.init.libp2p.peerId.toString()
    const key = cid.toString()
    const seen = new Set<string>()
    const emit = (p: { id: string, addrs: string[] }): Provider | null => {
      if (seen.has(p.id) || p.id === self) return null
      seen.add(p.id)
      return { id: peerIdFromString(p.id), multiaddrs: p.addrs.map(a => multiaddr(a)), routing: 'fret' } as unknown as Provider
    }
    for (const p of this.held(key)) { const e = emit(p); if (e) yield e }
    for (const peer of await this.cohort(cid)) {
      if (peer === self) continue
      try {
        const reply = await this.request(peer, { op: 'get', cid: key }, options) as { providers?: Array<{ id: string, addrs: string[] }> }
        for (const p of reply?.providers ?? []) { const e = emit(p); if (e) yield e }
      } catch { /* the next cohort member */ }
    }
  }

  private async request (peer: string, req: Request, options?: AbortOptions): Promise<unknown> {
    const signal = options?.signal ?? AbortSignal.timeout(10_000)
    const stream = await this.init.libp2p.dialProtocol(peerIdFromString(peer), PROVIDERS_PROTOCOL, { signal, runOnLimitedConnection: true })
    try {
      await sendJson(stream, req)
      const reply = await readJson<unknown>(stream, 256 * 1024)
      await stream.close()
      return reply
    } catch (err) {
      stream.abort(err instanceof Error ? err : new Error(String(err)))
      throw err
    }
  }

  private async answer (stream: Stream, connection: Connection): Promise<void> {
    try {
      const from = connection.remotePeer.toString()
      if (this.init.authorize != null && (await this.init.authorize(from)) !== true) {
        stream.abort(new Error('not authorized'))
        return
      }
      const req = await readJson<Request>(stream, 64 * 1024)
      CID.parse(req.cid)
      if (req.op === 'add') {
        // A record says who holds it: only the sender can say it of itself.
        this.keep(req.cid, from, Array.isArray(req.addrs) ? req.addrs.slice(0, 16).map(String) : [])
        await sendJson(stream, { ok: true })
      } else {
        await sendJson(stream, { providers: this.held(req.cid) })
      }
      await stream.close()
    } catch (err) {
      stream.abort(err instanceof Error ? err : new Error(String(err)))
    }
  }
}
