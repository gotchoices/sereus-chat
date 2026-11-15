/**
 * Files a strand's records refer to, on IPFS-on-a-strand (`@chat/strand-ipfs`). An app puts a
 * file and stores the CID in a record; members fetch it by CID. This layer adds what a bare
 * IPFS node does not know:
 *
 * - **Scope.** A file belongs to the strands it was put or fetched in, and a strand's node
 *   serves only its own files' blocks (StrandIpfs `servable`).
 * - **Announcements.** After a put, the holder tells the strand's connected members; each
 *   member's `onAnnounce` says whether to fetch now, and up to what size (checked against the
 *   file's root before anything else moves).
 * - **Placement, the file layer's offline mode.** A file records which members hold it (they
 *   announce it after fetching). One put here that nobody else holds is in the outbox: offered
 *   again when a member connects, when the strand's node changes (a wake), and every minute.
 * - **Lifetime.** Leases: put, fetch, `touch` and `reference` extend them; `gc` removes files
 *   whose lease ran out, and blocks no live file uses. An app keeps a file as long as a record
 *   points at it by calling `reference` when it reads the record.
 *
 * It also provides each file's root to the routers (FRET), so members not connected to the
 * holder can find it.
 */
import { unixfs } from '@helia/unixfs'
import { CID } from 'multiformats/cid'
import { readJson, sendJson, sha256, type StrandIpfs, type ByteStore } from '@chat/strand-ipfs'
import { dagShape } from './dag.js'
import * as dagPb from '@ipld/dag-pb'
import * as raw from 'multiformats/codecs/raw'
import { create as digestOf } from 'multiformats/hashes/digest'
import { UnixFS } from 'ipfs-unixfs'
import type { Blockstore } from 'interface-blockstore'
import type { Stream, Connection } from '@libp2p/interface'

export const ANNOUNCE_PROTOCOL = '/sereus/blobs/announce/1.0.0'
export const DEFAULT_LEASE_MS = 30 * 24 * 60 * 60 * 1000
const INDEX_KEY = '_blobs_index'
const OUTBOX_RETRY_MS = 60_000
/** The UnixFS layout every file gets: CIDv1, raw leaves, 1 MiB chunks (the current standard). */
const IMPORT_PROFILE = 'unixfs-v1-2025'
/** The profile's chunk size and widest node: what a native import must match. */
const CHUNK_SIZE = 1024 * 1024
const MAX_CHILDREN = 1024

export class NotAvailableError extends Error {
  constructor (message: string) { super(message); this.name = 'NotAvailableError' }
}

export interface BlobStatus {
  /** Every block is here. */
  here: boolean
  origin: 'put' | 'fetched'
  size: number
  /** Members known to hold it (peer ids of their strand nodes). */
  heldBy: string[]
  /** Some other member holds it. */
  placed: boolean
}

export interface StrandBlobsInit {
  /** The device's blocks (the same store every strand's StrandIpfs uses). */
  blockstore: Blockstore
  /** Where this layer keeps its index (the host's byte store). */
  index: Pick<ByteStore, 'get' | 'put'>
  leaseMs?: number
  /** A member announced a file: the most bytes to fetch it at, or false to leave it. */
  onAnnounce?: (scope: string, cid: string, size: number) => number | false | Promise<number | false>
  /** A file put here is now held by another member too. */
  onPlaced?: (scope: string, cid: string, by: string) => void
  /** Optional: join these blocks, in order, into one file at `path`, natively. */
  assemble?: (keys: string[], path: string) => Promise<void>
  /**
   * Optional: cut the file at `path` into blocks natively (read a chunk, keep it, hash it), each
   * kept under `name(its SHA-256, hex)`; resolves to the keys in order and the file's size. A
   * phone's file library can, and a file's bytes then never pass through JavaScript.
   */
  importFile?: (path: string, chunkSize: number, name: (sha256Hex: string) => string) => Promise<{ keys: string[], size: number }>
  log?: (line: string) => void
}

interface Entry {
  scopes: Set<string>
  expiresAt: number
  origin: 'put' | 'fetched'
  heldBy: Set<string>
  size: number
  /** Every block, once all are here (null until then). */
  blocks: string[] | null
  /** Raw leaves in order, when the file is made of them. */
  rawLeaves: string[] | null
  /** Offered to members (a file), or kept quietly (a tree adopted from a layer above, like a drive's root). */
  announce: boolean
}

interface Saved { scopes: string[], expiresAt: number, origin: 'put' | 'fetched', heldBy: string[], size: number, blocks: string[] | null, rawLeaves: string[] | null, announce?: boolean }

export class StrandBlobs {
  private readonly init: StrandBlobsInit
  private readonly leaseMs: number
  private readonly entries = new Map<string, Entry>()
  /** block CID → the files made of it. */
  private readonly blockFiles = new Map<string, Set<string>>()
  private readonly ipfs = new Map<string, StrandIpfs>()
  private readonly fetches = new Map<string, Promise<void>>()
  private readonly offerTimers = new Map<string, unknown>()
  private outboxTimer: unknown = null
  private opened: Promise<void> | null = null
  private saveTimer: unknown = null

  constructor (init: StrandBlobsInit) {
    this.init = init
    this.leaseMs = init.leaseMs ?? DEFAULT_LEASE_MS
  }

  private log (line: string): void { this.init.log?.(line) }

  // ------------------------------------------------------------------ index

  open (): Promise<void> {
    this.opened ??= (async () => {
      const raw = await this.init.index.get(INDEX_KEY)
      if (raw != null) {
        const saved = JSON.parse(new TextDecoder().decode(raw)) as { v: 1, files: Record<string, Saved> }
        for (const [cid, s] of Object.entries(saved.files ?? {})) {
          const e = this.entry(cid, s.origin, s.size)
          for (const sc of s.scopes) e.scopes.add(sc)
          for (const p of s.heldBy) e.heldBy.add(p)
          e.expiresAt = s.expiresAt
          e.announce = s.announce !== false
          if (s.blocks != null) this.complete(cid, s.blocks, s.rawLeaves)
        }
      }
      if (this.outbox().length > 0) this.armOutbox()
    })()
    return this.opened
  }

  private entry (cid: string, origin: 'put' | 'fetched', size: number): Entry {
    let e = this.entries.get(cid)
    if (e == null) {
      e = { scopes: new Set(), expiresAt: Date.now() + this.leaseMs, origin, heldBy: new Set(), size, blocks: null, rawLeaves: null, announce: true }
      this.entries.set(cid, e)
    }
    if (origin === 'put') e.origin = 'put'
    if (size > 0) e.size = size
    return e
  }

  private complete (cid: string, blocks: string[], rawLeaves: string[] | null): void {
    const e = this.entries.get(cid)
    if (e == null) return
    e.blocks = blocks
    e.rawLeaves = rawLeaves
    for (const b of blocks) (this.blockFiles.get(b) ?? this.blockFiles.set(b, new Set()).get(b)!).add(cid)
  }

  private async save (): Promise<void> {
    const files: Record<string, Saved> = {}
    for (const [cid, e] of this.entries) {
      files[cid] = { scopes: [...e.scopes], expiresAt: e.expiresAt, origin: e.origin, heldBy: [...e.heldBy], size: e.size, blocks: e.blocks, rawLeaves: e.rawLeaves, announce: e.announce }
    }
    await this.init.index.put(INDEX_KEY, new TextEncoder().encode(JSON.stringify({ v: 1, files })))
  }

  private saveSoon (): void {
    if (this.saveTimer != null) return
    const t = setTimeout(() => {
      this.saveTimer = null
      void this.save().catch(err => { this.log(`[blobs] saving the index failed: ${String(err)}`) })
    }, 1000) as { unref?: () => void }
    t.unref?.()
    this.saveTimer = t
  }

  /** Every block of `cid` from the local store, its DAG walked; null if one is missing. */
  private async shapeHere (cid: CID): Promise<{ blocks: string[], rawLeaves: string[] | null } | null> {
    try {
      const shape = await dagShape(cid, async c => {
        const parts: Uint8Array[] = []
        for await (const p of this.init.blockstore.get(c)) parts.push(p)
        return parts.length === 1 ? parts[0] : concat(parts)
      })
      for (const b of shape.blocks) if (!(await this.init.blockstore.has(b))) return null
      return { blocks: shape.blocks.map(String), rawLeaves: shape.rawLeaves?.map(String) ?? null }
    } catch {
      return null
    }
  }

  // ------------------------------------------------------------------ strands

  /** May strand `scope` serve this block? Only blocks of its own files. */
  servable (scope: string, cid: CID): boolean {
    const key = cid.toString()
    const direct = this.entries.get(key)
    if (direct != null) return direct.scopes.has(scope)
    for (const f of this.blockFiles.get(key) ?? []) if (this.entries.get(f)?.scopes.has(scope) === true) return true
    return false
  }

  /**
   * Serve strand `scope`'s files over its IPFS node (a new one after a wake: call again). Make
   * the StrandIpfs with `servable: cid => blobs.servable(scope, cid)`.
   */
  async attach (scope: string, ipfs: StrandIpfs): Promise<void> {
    await this.open()
    if (this.ipfs.get(scope) === ipfs) return
    this.ipfs.set(scope, ipfs)
    await ipfs.serveProtocol(ANNOUNCE_PROTOCOL, (stream, connection) => { void this.answer(scope, stream, connection) })
    ipfs.libp2p.addEventListener('peer:connect', () => { if (this.ipfs.get(scope) === ipfs) this.offerSoon(scope) })
    this.offerSoon(scope)
  }

  /** Stop using strand `scope`'s node (it is going away). */
  detach (scope: string, ipfs?: StrandIpfs): void {
    if (ipfs == null || this.ipfs.get(scope) === ipfs) this.ipfs.delete(scope)
  }

  // ------------------------------------------------------------------ files

  /** Store a file here, in `scope`, announce it, and provide it; resolves to its CID and size. */
  async put (scope: string, source: AsyncIterable<Uint8Array>): Promise<{ cid: string, size: number }> {
    await this.open()
    const ipfs = this.ipfs.get(scope)
    const t0 = Date.now()
    // Without a node yet (the strand starting), put straight into the local blocks.
    const store = ipfs?.blockstore ?? this.init.blockstore
    let size = 0
    const counted = (async function * () { for await (const p of source) { size += p.length; yield p } })()
    // Hashed natively where the platform can (strand-ipfs `sha256`).
    const root = await unixfs({ blockstore: store }).addByteStream(counted, { profile: IMPORT_PROFILE, hasher: sha256 } as never)
    return this.finishPut(scope, root, size, t0, 'put')
  }

  private async finishPut (scope: string, root: CID, size: number, t0: number, how: string): Promise<{ cid: string, size: number }> {
    const ipfs = this.ipfs.get(scope)
    const cid = root.toString()
    const e = this.entry(cid, 'put', size)
    e.scopes.add(scope)
    e.expiresAt = Math.max(e.expiresAt, Date.now() + this.leaseMs)
    const shape = await this.shapeHere(root)
    if (shape != null) this.complete(cid, shape.blocks, shape.rawLeaves)
    await this.save()
    this.armOutbox()
    this.log(`[blobs] ${how} ${(size / 1e6).toFixed(2)} MB as ${shape?.blocks.length ?? '?'} blocks in ${Date.now() - t0} ms`)
    if (ipfs != null) {
      void this.announce(scope, cid).catch(() => {})
      void ipfs.provide(root).catch(() => {})
    }
    return { cid, size }
  }

  /**
   * Store the file at `path` (a path on this device): cut into blocks natively when the host can
   * (`importFile`), giving the same CID UnixFS would; else read through `read`, as `put`.
   */
  async putPath (scope: string, path: string, read: () => AsyncIterable<Uint8Array>): Promise<{ cid: string, size: number }> {
    if (this.init.importFile == null) return this.put(scope, read())
    await this.open()
    const t0 = Date.now()
    const { keys, size } = await this.init.importFile(path, CHUNK_SIZE, hex => CID.createV1(raw.code, digestOf(0x12, hexToBytes(hex))).toString())
    // The importer's layout for an empty file, or one wider than one node, is left to it.
    if (size === 0 || keys.length > MAX_CHILDREN) return this.put(scope, read())
    let root: CID
    if (keys.length === 1) {
      // One chunk: the file is its raw leaf (the profile reduces a single leaf to itself).
      root = CID.parse(keys[0])
    } else {
      // The importer's file node: a UnixFS file header listing each leaf's size, linking them.
      const sizes = keys.map((_, i) => i < keys.length - 1 ? CHUNK_SIZE : size - CHUNK_SIZE * (keys.length - 1))
      const f = new UnixFS({ type: 'file' })
      for (const n of sizes) f.addBlockSize(BigInt(n))
      const block = dagPb.encode(dagPb.prepare({ Data: f.marshal(), Links: keys.map((k, i) => ({ Name: '', Tsize: sizes[i], Hash: CID.parse(k) })) }))
      root = CID.createV1(dagPb.code, await sha256.digest(block))
      await this.init.blockstore.put(root, block)
    }
    return this.finishPut(scope, root, size, t0, 'imported')
  }

  /**
   * Take on a DAG already in the block store (a layer above wrote it: a drive's new root): serve
   * it in `scope`, keep it a lease, and provide it, without announcing it (members fetch what
   * they read).
   */
  async adopt (scope: string, cid: string): Promise<void> {
    await this.open()
    const root = CID.parse(cid)
    const shape = await this.shapeHere(root)
    if (shape == null) throw new Error(`not every block of ${cid} is here to adopt`)
    const e = this.entry(cid, 'put', 0)
    e.announce = false
    e.scopes.add(scope)
    e.expiresAt = Math.max(e.expiresAt, Date.now() + this.leaseMs)
    this.complete(cid, shape.blocks, shape.rawLeaves)
    this.saveSoon()
    void this.ipfs.get(scope)?.provide(root).catch(() => {})
  }

  /** Let a file or tree go at the next gc (blocks another live one uses stay). */
  async release (cid: string): Promise<void> {
    await this.open()
    const e = this.entries.get(cid)
    if (e == null) return
    e.expiresAt = 0
    this.saveSoon()
  }

  /** Is every block of the file here? */
  async has (cid: string): Promise<boolean> {
    await this.open()
    return this.entries.get(cid)?.blocks != null
  }

  async status (cid: string): Promise<BlobStatus | null> {
    await this.open()
    const e = this.entries.get(cid)
    if (e == null) return null
    return { here: e.blocks != null, origin: e.origin, size: e.size, heldBy: [...e.heldBy], placed: e.heldBy.size > 0 }
  }

  /** Files put here (in `scope`, or anywhere) that no other member is known to hold. */
  outbox (scope?: string): string[] {
    const out: string[] = []
    for (const [cid, e] of this.entries) {
      if (e.origin === 'put' && e.announce && e.heldBy.size === 0 && (scope == null || e.scopes.has(scope))) out.push(cid)
    }
    return out
  }

  /**
   * Bring the whole file here from the strand. One fetch per file at a time. Throws
   * `NotAvailableError` when no member that has it answers in time (retry later).
   */
  fetch (scope: string, cid: string, opts: { maxBytes?: number, timeoutMs?: number } = {}): Promise<void> {
    const key = `${scope} ${cid}`
    let p = this.fetches.get(key)
    if (p == null) {
      p = this.doFetch(scope, cid, opts).finally(() => this.fetches.delete(key))
      this.fetches.set(key, p)
    }
    return p
  }

  private async doFetch (scope: string, cid: string, opts: { maxBytes?: number, timeoutMs?: number }): Promise<void> {
    await this.open()
    const root = CID.parse(cid)
    const known = this.entries.get(cid)
    if (known?.blocks != null) {
      if (!known.scopes.has(scope)) { known.scopes.add(scope); this.saveSoon() }
      return
    }
    const ipfs = this.ipfs.get(scope)
    if (ipfs == null) throw new NotAvailableError(`no network for ${scope} here`)
    const t0 = Date.now()
    const signal = AbortSignal.timeout(opts.timeoutMs ?? 60_000)
    const fs = unixfs(ipfs)
    let size: number
    try {
      size = Number((await fs.stat(root, { signal })).size)
    } catch (err) {
      throw new NotAvailableError(`no reachable member has ${cid} (${err instanceof Error ? err.message : String(err)})`)
    }
    if (opts.maxBytes !== undefined && size > opts.maxBytes) throw new Error(`file ${cid} is ${size} bytes, over the ${opts.maxBytes}-byte limit`)
    const e = this.entry(cid, 'fetched', size)
    e.scopes.add(scope)
    e.expiresAt = Math.max(e.expiresAt, Date.now() + this.leaseMs)
    try {
      // Reading it whole brings every block here (each checked against its CID on arrival).
      for await (const _ of fs.cat(root, { signal })) { /* drain */ }
    } catch (err) {
      this.saveSoon()
      throw new NotAvailableError(`not every part of ${cid} is reachable yet (${err instanceof Error ? err.message : String(err)})`)
    }
    const shape = await this.shapeHere(root)
    if (shape == null) throw new NotAvailableError(`not every part of ${cid} arrived`)
    this.complete(cid, shape.blocks, shape.rawLeaves)
    this.saveSoon()
    this.log(`[blobs] fetched ${(size / 1e6).toFixed(2)} MB (${shape.blocks.length} blocks) in ${Date.now() - t0} ms`)
    // Now a holder: tell the members (the source learns its file is placed), and provide it.
    void this.announce(scope, cid).catch(() => {})
    void ipfs.provide(root).catch(() => {})
  }

  /** The file's bytes, fetching what is missing first. */
  async * read (scope: string, cid: string): AsyncGenerator<Uint8Array> {
    if (!(await this.has(cid))) await this.fetch(scope, cid)
    const ipfs = this.ipfs.get(scope)
    const store = ipfs?.blockstore ?? this.init.blockstore
    yield * unixfs({ blockstore: store }).cat(CID.parse(cid))
  }

  /**
   * Write the whole file to `path` on this device natively, when the host can join blocks and
   * the file is made of raw leaves; false (nothing written) otherwise.
   */
  async saveAs (scope: string, cid: string, path: string): Promise<boolean> {
    if (this.init.assemble == null) return false
    if (!(await this.has(cid))) await this.fetch(scope, cid)
    const leaves = this.entries.get(cid)?.rawLeaves
    if (leaves == null) return false
    await this.init.assemble(leaves, path)
    return true
  }

  // ------------------------------------------------------------------ announcements

  /** Tell `scope`'s connected members this file is here (best-effort); resolves to how many heard. */
  async announce (scope: string, cid: string, opts: { quiet?: boolean } = {}): Promise<number> {
    const ipfs = this.ipfs.get(scope)
    const e = this.entries.get(cid)
    if (ipfs == null || e == null) return 0
    const peers = [...new Set(ipfs.libp2p.getConnections().map(c => c.remotePeer.toString()))]
    let told = 0
    await Promise.all(peers.map(async peer => {
      const conn = ipfs.libp2p.getConnections().find(c => c.remotePeer.toString() === peer)
      if (conn == null) return
      try {
        const stream = await conn.newStream(ANNOUNCE_PROTOCOL, { signal: AbortSignal.timeout(10_000), runOnLimitedConnection: true })
        await sendJson(stream, { announce: [{ cid, size: e.size }] })
        await stream.close()
        told++
      } catch { /* not a member's node (the relay), or gone */ }
    }))
    if (told > 0 || opts.quiet !== true) this.log(`[blobs] announced ${cid.slice(-8)} to ${told} member(s)`)
    return told
  }

  private async answer (scope: string, stream: Stream, connection: Connection): Promise<void> {
    try {
      const from = connection.remotePeer.toString()
      const req = await readJson<{ announce?: Array<{ cid: string, size: number }> }>(stream, 64 * 1024)
      await stream.close()
      for (const a of (req.announce ?? []).slice(0, 64)) {
        if (typeof a?.cid !== 'string') continue
        void this.announced(scope, a.cid, Number(a.size) || 0, from)
      }
    } catch (err) {
      stream.abort(err instanceof Error ? err : new Error(String(err)))
    }
  }

  private async announced (scope: string, cid: string, size: number, from: string): Promise<void> {
    try {
      CID.parse(cid)
      await this.open()
      const e = this.entries.get(cid)
      // The announcer holds the whole file.
      if (e != null && e.scopes.has(scope) && !e.heldBy.has(from)) {
        const wasPlaced = e.heldBy.size > 0
        e.heldBy.add(from)
        this.saveSoon()
        if (!wasPlaced && e.origin === 'put') {
          this.log(`[blobs] ${cid.slice(-8)} placed: ${from.slice(-8)} holds it`)
          this.init.onPlaced?.(scope, cid, from)
        }
      }
      if (this.init.onAnnounce == null || e?.blocks != null) return
      const maxBytes = await this.init.onAnnounce(scope, cid, size)
      if (maxBytes === false) return
      await this.fetch(scope, cid, { maxBytes })
    } catch (err) {
      this.log(`[blobs] fetching announced ${cid.slice(-8)} failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // ------------------------------------------------------------------ outbox

  private offerSoon (scope: string): void {
    if (this.offerTimers.has(scope)) return
    const t = setTimeout(() => {
      this.offerTimers.delete(scope)
      void this.offer(scope)
    }, 1500) as { unref?: () => void }
    t.unref?.()
    this.offerTimers.set(scope, t)
  }

  private async offer (scope: string): Promise<void> {
    await this.open()
    const pending = this.outbox(scope)
    if (pending.length === 0 || !this.ipfs.has(scope)) return
    let told = 0
    for (const cid of pending) told += await this.announce(scope, cid, { quiet: true }).catch(() => 0)
    if (told > 0) this.log(`[blobs] offered ${pending.length} file(s) nobody else holds yet in ${scope.slice(0, 8)}`)
  }

  private armOutbox (): void {
    if (this.outboxTimer != null) return
    const t = setInterval(() => {
      if (this.outbox().length === 0) { clearInterval(t as never); this.outboxTimer = null; return }
      for (const scope of this.ipfs.keys()) void this.offer(scope)
    }, OUTBOX_RETRY_MS) as { unref?: () => void }
    t.unref?.()
    this.outboxTimer = t
  }

  // ------------------------------------------------------------------ lifetime

  async touch (cid: string, ms = this.leaseMs): Promise<void> {
    await this.open()
    const e = this.entries.get(cid)
    if (e == null) return
    e.expiresAt = Math.max(e.expiresAt, Date.now() + ms)
    this.saveSoon()
  }

  /** A record in `scope` points at this file: keep it a full lease from now, and serve it there. */
  async reference (scope: string, cid: string): Promise<void> {
    await this.open()
    const e = this.entries.get(cid)
    if (e == null) return
    const before = e.expiresAt
    e.scopes.add(scope)
    e.expiresAt = Math.max(e.expiresAt, Date.now() + this.leaseMs)
    if (e.expiresAt - before > 24 * 60 * 60 * 1000) this.saveSoon()
  }

  /** Remove files whose lease ran out, and the blocks no live file uses. */
  async gc (now = Date.now()): Promise<{ files: number, blocks: number }> {
    await this.open()
    let files = 0
    let blocks = 0
    for (const [cid, e] of [...this.entries]) {
      if (e.expiresAt > now) continue
      this.entries.delete(cid)
      files++
      for (const b of e.blocks ?? [cid]) {
        const users = this.blockFiles.get(b)
        users?.delete(cid)
        if ((users?.size ?? 0) === 0) {
          this.blockFiles.delete(b)
          try { await this.init.blockstore.delete(CID.parse(b)) } catch { /* already gone */ }
          blocks++
        }
      }
    }
    if (files > 0) await this.save()
    return { files, blocks }
  }
}

function hexToBytes (hex: string): Uint8Array {
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) throw new Error(`not a SHA-256 hex digest: ${hex}`)
  const out = new Uint8Array(32)
  for (let i = 0; i < 32; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return out
}

function concat (parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) { out.set(p, at); at += p.length }
  return out
}
