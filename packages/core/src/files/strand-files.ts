/**
 * strand-files.ts — files for a strand's members, outside the transaction path
 * (gotchoices/sereus#62; see README.md beside this file).
 *
 * A file is split into chunks; each chunk is a block named by its CID (raw, sha-256), and a
 * manifest block lists them (JSON, named by its own CID: the file's id). Blocks are kept in the
 * device's `BlockStore` and exchanged with the strand's members over one small protocol:
 * "want these CIDs" answered, per CID, with the bytes or "not here". Every block is checked
 * against its CID on arrival, so any member can serve any block.
 *
 * Scope: a strand. A file belongs to the scopes (strands) it was put or fetched in, and is
 * served only to peers asking over that scope's node, so knowing a CID is not enough to read a
 * file from another strand.
 *
 * Lifetime: every file has a lease. Putting, fetching, touching or referencing it extends the
 * lease; `gc` deletes files whose lease has run out (and chunks no live file uses). An app keeps
 * a file as long as its records point at it by calling `reference` while it holds them.
 */
import { cidFor, JSON_CODEC, parseCid, RAW } from './cid.js';
import { ByteReader, readJson, send, sendJson, u32 } from './frames.js';
import { equalBytes, sha256 } from './hash.js';
import type { BlockStore, Libp2pLike, PeerIdLike, StreamLike } from './types.js';

export const FILES_PROTOCOL = '/sereus/strand-files/1.0.0';
export const DEFAULT_CHUNK_SIZE = 256 * 1024;
export const DEFAULT_LEASE_MS = 30 * 24 * 60 * 60 * 1000;
const INDEX_KEY = '_index';
const MAX_WANT = 64;
const MAX_MANIFEST_BYTES = 4 * 1024 * 1024;
/** A request that delivers nothing for this long is abandoned and its CIDs asked elsewhere. */
const STALL_MS = 20_000;
/** A peer that does not speak the protocol (the relay) is not asked again for this long. */
const MUTE_MS = 60_000;

export interface Manifest {
  v: 1;
  size: number;
  chunkSize: number;
  chunks: string[];
}

interface RootEntry {
  manifest: Manifest;
  scopes: Set<string>;
  expiresAt: number;
}

export class NotAvailableError extends Error {
  constructor(message: string, readonly missing: 'manifest' | 'chunks', readonly have = 0, readonly total = 0) {
    super(message);
    this.name = 'NotAvailableError';
  }
}

export interface StrandFilesOptions {
  blocks: BlockStore;
  /**
   * A member announced a new file in `scope` (`announce`). Return the most bytes to fetch it at
   * (checked against its manifest before any chunk moves), or false to leave it; without this
   * nothing announced is fetched.
   */
  onAnnounce?: (scope: string, cid: string) => number | false | Promise<number | false>;
  chunkSize?: number;
  leaseMs?: number;
  /** Requests in flight per fetch. */
  parallel?: number;
  /** CIDs per request. */
  perRequest?: number;
  log?: (line: string) => void;
}

export interface FetchReport {
  bytes: number;
  chunks: number;
  ms: number;
  peers: string[];
}

const encoder = new TextEncoder();

function hexToBytes(hex: string): Uint8Array {
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) throw new Error(`not a SHA-256 hex digest: ${hex}`);
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}
const decoder = new TextDecoder();

async function* rechunk(source: AsyncIterable<Uint8Array>, size: number): AsyncIterable<Uint8Array> {
  let buf = new Uint8Array(size);
  let fill = 0;
  for await (const piece of source) {
    let at = 0;
    while (at < piece.length) {
      const n = Math.min(size - fill, piece.length - at);
      buf.set(piece.subarray(at, at + n), fill);
      fill += n; at += n;
      if (fill === size) { yield buf; buf = new Uint8Array(size); fill = 0; }
    }
  }
  if (fill > 0) yield buf.subarray(0, fill);
}

function encodeManifest(m: Manifest): Uint8Array {
  return encoder.encode(JSON.stringify({ v: m.v, size: m.size, chunkSize: m.chunkSize, chunks: m.chunks }));
}

/** Does `bytes` hash to `cid`? */
async function matches(cid: string, bytes: Uint8Array): Promise<boolean> {
  const { digest } = parseCid(cid);
  return equalBytes(digest, await sha256(bytes));
}

export class StrandFiles {
  private readonly blocks: BlockStore;
  private readonly chunkSize: number;
  private readonly leaseMs: number;
  private readonly parallel: number;
  private readonly perRequest: number;
  private readonly log: (line: string) => void;
  private readonly onAnnounce?: (scope: string, cid: string) => number | false | Promise<number | false>;
  private readonly roots = new Map<string, RootEntry>();
  /** chunk CID → the roots that list it. */
  private readonly chunkRoots = new Map<string, Set<string>>();
  private readonly nodes = new Map<string, Libp2pLike>();
  private readonly handled = new WeakSet<object>();
  private readonly muted = new Map<string, number>();
  private readonly inFlight = new Map<string, Promise<FetchReport>>();
  private opened: Promise<void> | null = null;
  private saveTimer: unknown = null;

  constructor(opts: StrandFilesOptions) {
    this.blocks = opts.blocks;
    this.chunkSize = opts.chunkSize ?? DEFAULT_CHUNK_SIZE;
    this.leaseMs = opts.leaseMs ?? DEFAULT_LEASE_MS;
    this.parallel = opts.parallel ?? 4;
    this.perRequest = opts.perRequest ?? 4;
    this.log = opts.log ?? (() => {});
    this.onAnnounce = opts.onAnnounce;
  }

  // ---------------------------------------------------------------- index

  /** Load the index (idempotent). */
  open(): Promise<void> {
    this.opened ??= (async () => {
      const raw = await this.blocks.get(INDEX_KEY);
      if (!raw) return;
      const saved = JSON.parse(decoder.decode(raw)) as { v: 1; roots: Record<string, { scopes: string[]; expiresAt: number }> };
      for (const [cid, r] of Object.entries(saved.roots ?? {})) {
        const bytes = await this.blocks.get(cid);
        if (!bytes) continue;
        this.index(cid, JSON.parse(decoder.decode(bytes)) as Manifest, r.scopes, r.expiresAt);
      }
    })();
    return this.opened;
  }

  private index(cid: string, manifest: Manifest, scopes: Iterable<string>, expiresAt: number): RootEntry {
    let entry = this.roots.get(cid);
    if (!entry) {
      entry = { manifest, scopes: new Set(), expiresAt };
      this.roots.set(cid, entry);
      for (const c of manifest.chunks) (this.chunkRoots.get(c) ?? this.chunkRoots.set(c, new Set()).get(c)!).add(cid);
    }
    for (const s of scopes) entry.scopes.add(s);
    entry.expiresAt = Math.max(entry.expiresAt, expiresAt);
    return entry;
  }

  private async save(): Promise<void> {
    const roots: Record<string, { scopes: string[]; expiresAt: number }> = {};
    for (const [cid, r] of this.roots) roots[cid] = { scopes: [...r.scopes], expiresAt: r.expiresAt };
    await this.blocks.put(INDEX_KEY, encoder.encode(JSON.stringify({ v: 1, roots })));
  }

  /** Save soon, once for a burst of changes. */
  private saveSoon(): void {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.save().catch(err => this.log(`[files] saving the index failed: ${String(err)}`));
    }, 1000);
  }

  // ---------------------------------------------------------------- write

  /** Store a file's bytes here, in `scope`; resolves to its CID and size. Nothing is sent. */
  async put(scope: string, source: AsyncIterable<Uint8Array>): Promise<{ cid: string; size: number }> {
    await this.open();
    const t0 = Date.now();
    let size = 0, hashMs = 0, storeMs = 0;
    const chunks: string[] = [];
    for await (const chunk of rechunk(source, this.chunkSize)) {
      let t = Date.now();
      const cid = cidFor(RAW, await sha256(chunk));
      hashMs += Date.now() - t;
      t = Date.now();
      if (!(await this.blocks.has(cid))) await this.blocks.put(cid, chunk);
      storeMs += Date.now() - t;
      chunks.push(cid);
      size += chunk.length;
    }
    return this.finishPut(scope, chunks, size, t0, `put (hash ${hashMs} ms, store ${storeMs} ms)`);
  }

  /**
   * Store the file at `path` (a path on this device) in `scope`: natively when the block store
   * can import files (`BlockStore.importFile`), else from `read()`, as `put` does.
   */
  async putPath(scope: string, path: string, read: () => AsyncIterable<Uint8Array>): Promise<{ cid: string; size: number }> {
    if (!this.blocks.importFile) return this.put(scope, read());
    await this.open();
    const t0 = Date.now();
    const { keys, size } = await this.blocks.importFile(path, this.chunkSize, hex => cidFor(RAW, hexToBytes(hex)));
    return this.finishPut(scope, keys, size, t0, 'imported');
  }

  private async finishPut(scope: string, chunks: string[], size: number, t0: number, how: string): Promise<{ cid: string; size: number }> {
    const manifest: Manifest = { v: 1, size, chunkSize: this.chunkSize, chunks };
    const bytes = encodeManifest(manifest);
    const cid = cidFor(JSON_CODEC, await sha256(bytes));
    await this.blocks.put(cid, bytes);
    this.index(cid, manifest, [scope], Date.now() + this.leaseMs);
    await this.save();
    this.log(`[files] ${how} ${(size / 1e6).toFixed(2)} MB as ${chunks.length} chunks in ${Date.now() - t0} ms`);
    return { cid, size };
  }

  // ---------------------------------------------------------------- read

  /** The file's manifest, if it is known here. */
  async manifest(cid: string): Promise<Manifest | null> {
    await this.open();
    return this.roots.get(cid)?.manifest ?? null;
  }

  /** Is every block of the file here? */
  async has(cid: string): Promise<boolean> {
    await this.open();
    const entry = this.roots.get(cid);
    if (!entry) return false;
    for (const c of entry.manifest.chunks) if (!(await this.blocks.has(c))) return false;
    return true;
  }

  /** The file's bytes in order, fetching what is missing from the scope's members first. */
  async *read(scope: string, cid: string, opts: { node?: Libp2pLike } = {}): AsyncIterable<Uint8Array> {
    if (!(await this.has(cid))) await this.fetch(scope, cid, opts);
    const entry = this.roots.get(cid)!;
    for (const c of entry.manifest.chunks) {
      const bytes = await this.blocks.get(c);
      if (!bytes) throw new NotAvailableError(`chunk ${c} went missing while reading`, 'chunks');
      yield bytes;
    }
  }

  /**
   * Write the whole file to `path` on this device, fetching what is missing first. Natively when
   * the block store can (`BlockStore.assemble`); returns false, writing nothing, when it can't
   * (the caller writes `read()` itself).
   */
  async saveAs(scope: string, cid: string, path: string, opts: { node?: Libp2pLike } = {}): Promise<boolean> {
    if (!this.blocks.assemble) return false;
    if (!(await this.has(cid))) await this.fetch(scope, cid, opts);
    await this.blocks.assemble(this.roots.get(cid)!.manifest.chunks, path);
    return true;
  }

  /**
   * Bring the whole file here from the scope's members. One fetch per file at a time; a second
   * call while one runs shares it. Throws `NotAvailableError` when no reachable member has some
   * part (retry later: a member with it may come online).
   */
  fetch(scope: string, cid: string, opts: { node?: Libp2pLike; maxBytes?: number } = {}): Promise<FetchReport> {
    const key = `${scope} ${cid}`;
    let p = this.inFlight.get(key);
    if (!p) {
      p = this.doFetch(scope, cid, opts).finally(() => this.inFlight.delete(key));
      this.inFlight.set(key, p);
    }
    return p;
  }

  private async doFetch(scope: string, cid: string, opts: { node?: Libp2pLike; maxBytes?: number }): Promise<FetchReport> {
    await this.open();
    const node = opts.node ?? this.nodes.get(scope);
    if (!node) throw new NotAvailableError(`no network for ${scope} here`, 'manifest');
    await this.serve(scope, node);
    const t0 = Date.now();
    const used = new Set<string>();
    let bytes = 0, fetched = 0;

    let entry = this.roots.get(cid);
    if (!entry) {
      const got = await this.fetchBlocks(node, [cid], used, MAX_MANIFEST_BYTES);
      const raw = got.get(cid);
      if (!raw) throw new NotAvailableError('no reachable member has this file', 'manifest');
      const manifest = JSON.parse(decoder.decode(raw)) as Manifest;
      if (manifest.v !== 1 || !Array.isArray(manifest.chunks)) throw new Error(`file ${cid}: not a manifest this version reads`);
      await this.blocks.put(cid, raw);
      entry = this.index(cid, manifest, [scope], Date.now() + this.leaseMs);
      await this.save();
      bytes += raw.length;
    } else if (!entry.scopes.has(scope)) {
      this.index(cid, entry.manifest, [scope], Date.now() + this.leaseMs);
      this.saveSoon();
    }

    if (opts.maxBytes !== undefined && entry.manifest.size > opts.maxBytes) {
      throw new Error(`file ${cid} is ${entry.manifest.size} bytes, over the ${opts.maxBytes}-byte limit`);
    }
    const missing: string[] = [];
    for (const c of entry.manifest.chunks) if (!(await this.blocks.has(c))) missing.push(c);
    if (missing.length) {
      const got = await this.fetchBlocks(node, missing, used, this.chunkSize, (c, b) => this.blocks.put(c, b));
      for (const b of got.values()) bytes += b.length;
      fetched = got.size;
      const still = missing.filter(c => !got.has(c));
      if (still.length) {
        throw new NotAvailableError(`${still.length} of ${entry.manifest.chunks.length} parts are not reachable yet`,
          'chunks', entry.manifest.chunks.length - still.length, entry.manifest.chunks.length);
      }
    }
    entry.expiresAt = Math.max(entry.expiresAt, Date.now() + this.leaseMs);
    this.saveSoon();
    const report: FetchReport = { bytes, chunks: fetched, ms: Date.now() - t0, peers: [...used] };
    this.log(`[files] fetched ${(bytes / 1e6).toFixed(2)} MB (${fetched} chunks) in ${report.ms} ms from ${used.size} peer(s)`);
    return report;
  }

  /** The peers to ask over `node`: everyone it is connected to, but not ones known to be mute. */
  private candidates(node: Libp2pLike): PeerIdLike[] {
    const now = Date.now();
    const seen = new Map<string, PeerIdLike>();
    for (const c of node.getConnections()) {
      const id = c.remotePeer.toString();
      if ((this.muted.get(id) ?? 0) > now) continue;
      seen.set(id, c.remotePeer);
    }
    return [...seen.values()];
  }

  /**
   * Fetch `keys` from the peers on `node`, `parallel` requests of `perRequest` keys at a time,
   * checking each block against its CID. A key a peer does not have is asked of the next peer.
   * `store`, when given, keeps each block as it arrives (and the result then holds it too).
   */
  private async fetchBlocks(node: Libp2pLike, keys: string[], used: Set<string>, maxBlock: number,
    store?: (cid: string, bytes: Uint8Array) => Promise<void>): Promise<Map<string, Uint8Array>> {
    const got = new Map<string, Uint8Array>();
    const peers = this.candidates(node);
    if (!peers.length) return got;
    /** Peers that said no (or failed) for each key. */
    const refused = new Map<string, Set<string>>();
    const queue = [...keys];
    let turn = 0;
    const worker = async (): Promise<void> => {
      for (;;) {
        const batch: string[] = [];
        while (batch.length < this.perRequest && queue.length) batch.push(queue.shift()!);
        if (!batch.length) return;
        // The next peer that has not refused the batch's first key.
        const live = this.candidates(node).filter(p => !refused.get(batch[0])?.has(p.toString()));
        if (!live.length) continue;   // nobody left to ask for these: drop them
        const peer = live[turn++ % live.length];
        const id = peer.toString();
        const answered = new Set<string>();
        try {
          for await (const { key, bytes } of this.request(node, peer, batch, maxBlock)) {
            answered.add(key);
            if (bytes && await matches(key, bytes)) {
              if (store) await store(key, bytes);
              got.set(key, bytes);
              used.add(id);
            } else {
              (refused.get(key) ?? refused.set(key, new Set()).get(key)!).add(id);
              queue.push(key);
            }
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          // Not our protocol (the relay, a peer without it): don't ask it again for a while.
          if (/protocol|negotiat|not supported|UnsupportedProtocol/i.test(message)) this.muted.set(id, Date.now() + MUTE_MS);
          else this.log(`[files] request to ${id.slice(-8)} failed: ${message}`);
          for (const key of batch) {
            if (answered.has(key)) continue;
            (refused.get(key) ?? refused.set(key, new Set()).get(key)!).add(id);
            queue.push(key);
          }
        }
        // A key every candidate refused stays out of the queue.
        const peersNow = this.candidates(node).map(p => p.toString());
        for (let i = queue.length - 1; i >= 0; i--) {
          const r = refused.get(queue[i]);
          if (r && peersNow.every(p => r.has(p))) queue.splice(i, 1);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(this.parallel, Math.max(1, Math.ceil(keys.length / this.perRequest))) }, worker));
    return got;
  }

  /** One request: the blocks for `keys`, as the peer answers each (null: not there). */
  private async *request(node: Libp2pLike, peer: PeerIdLike, keys: string[], maxBlock: number): AsyncGenerator<{ key: string; bytes: Uint8Array | null }> {
    const controller = new AbortController();
    let timer: unknown = null;
    const arm = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => controller.abort(new Error(`no data for ${STALL_MS / 1000} s`)), STALL_MS);
    };
    arm();
    let stream: StreamLike | null = null;
    try {
      stream = await node.dialProtocol(peer, FILES_PROTOCOL, { signal: controller.signal, runOnLimitedConnection: true });
      const s = stream;
      controller.signal.addEventListener('abort', () => s.abort(new Error(String(controller.signal.reason))), { once: true });
      await sendJson(s, { want: keys }, controller.signal);
      const reader = new ByteReader(s);
      for (const key of keys) {
        const status = await reader.u8();
        const len = await reader.u32();
        if (len > maxBlock + 1024) throw new Error(`block of ${len} bytes is over the limit`);
        const bytes = len ? await reader.read(len) : null;
        arm();
        yield { key, bytes: status === 1 ? bytes : null };
      }
      await s.close().catch(() => {});
    } catch (err) {
      stream?.abort(err instanceof Error ? err : new Error(String(err)));
      throw err;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /**
   * Tell the scope's connected members that this file is here, so the ones that want it fetch it
   * now rather than when someone looks (their `onAnnounce` decides). Best-effort: a member that
   * misses the announcement fetches when it reads the file.
   */
  async announce(scope: string, cid: string, opts: { node?: Libp2pLike } = {}): Promise<number> {
    const node = opts.node ?? this.nodes.get(scope);
    if (!node) return 0;
    // The manifest goes with the announcement (checked against the CID on arrival), saving the
    // receiver a round trip.
    const raw = await this.blocks.get(cid);
    const manifest = raw ? decoder.decode(raw) : null;
    let told = 0;
    await Promise.all(this.candidates(node).map(async (peer) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(new Error('announce timed out')), 10_000);
      try {
        const stream = await node.dialProtocol(peer, FILES_PROTOCOL, { signal: controller.signal, runOnLimitedConnection: true });
        await sendJson(stream, { announce: [cid], manifests: manifest ? { [cid]: manifest } : {} }, controller.signal);
        await stream.close();
        told++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (/protocol|negotiat|not supported|UnsupportedProtocol/i.test(message)) this.muted.set(peer.toString(), Date.now() + MUTE_MS);
      } finally {
        clearTimeout(timer);
      }
    }));
    this.log(`[files] announced ${cid.slice(-8)} to ${told} member(s)`);
    return told;
  }

  // ---------------------------------------------------------------- serve

  /** Serve this scope's files over `node` (idempotent; call again with a replacement node). */
  async serve(scope: string, node: Libp2pLike): Promise<void> {
    this.nodes.set(scope, node);
    if (this.handled.has(node)) return;
    this.handled.add(node);
    await node.handle(FILES_PROTOCOL, (stream) => this.answer(scope, stream), { runOnLimitedConnection: true, maxInboundStreams: 64 })
      .catch((err: unknown) => { this.handled.delete(node); throw err; });
  }

  /** Stop serving `scope` (its node is going away). */
  forget(scope: string): void {
    this.nodes.delete(scope);
  }

  private allowed(scope: string, key: string): boolean {
    const root = this.roots.get(key);
    if (root) return root.scopes.has(scope);
    for (const r of this.chunkRoots.get(key) ?? []) if (this.roots.get(r)?.scopes.has(scope)) return true;
    return false;
  }

  private async answer(scope: string, stream: StreamLike): Promise<void> {
    try {
      await this.open();
      const reader = new ByteReader(stream);
      const request = await readJson<{ want?: string[]; announce?: string[]; manifests?: Record<string, string> }>(reader, MAX_MANIFEST_BYTES);
      if (Array.isArray(request.announce)) {
        await stream.close();
        for (const cid of request.announce.slice(0, MAX_WANT)) {
          const m = request.manifests?.[cid];
          void this.announced(scope, cid, typeof m === 'string' ? m : undefined);
        }
        return;
      }
      const want = request.want;
      if (!Array.isArray(want) || want.length > MAX_WANT) throw new Error('bad want-list');
      const t0 = Date.now();
      let readMs = 0, served = 0, bytesOut = 0;
      // The next block is read while this one is sent: on a slow phone the read is most of the cost.
      const readOf = (key: unknown) => {
        const t = Date.now();
        const p = typeof key === 'string' && this.allowed(scope, key) ? this.blocks.get(key) : Promise.resolve(null);
        return p.then(b => { readMs += Date.now() - t; return b; });
      };
      let next = want.length ? readOf(want[0]) : null;
      for (let i = 0; i < want.length; i++) {
        const bytes = await next!;
        next = i + 1 < want.length ? readOf(want[i + 1]) : null;
        await send(stream, new Uint8Array([bytes ? 1 : 0]));
        await send(stream, u32(bytes?.length ?? 0));
        if (bytes) { await send(stream, bytes); served++; bytesOut += bytes.length; }
      }
      await stream.close();
      if (bytesOut > 64 * 1024) {
        this.log(`[files] served ${served} block(s), ${(bytesOut / 1e6).toFixed(2)} MB, in ${Date.now() - t0} ms (reading ${readMs} ms)`);
      }
    } catch (err) {
      stream.abort(err instanceof Error ? err : new Error(String(err)));
    }
  }

  /** A member announced `cid`: fetch it if the app wants it and it is not here yet. */
  private async announced(scope: string, cid: string, manifest?: string): Promise<void> {
    try {
      parseCid(cid);
      if (!this.onAnnounce || await this.has(cid)) return;
      // Its manifest came along: keep it if it is the one the CID names.
      if (manifest !== undefined && !this.roots.has(cid)) {
        const raw = encoder.encode(manifest);
        if (await matches(cid, raw)) {
          const parsed = JSON.parse(manifest) as Manifest;
          if (parsed.v === 1 && Array.isArray(parsed.chunks)) {
            await this.blocks.put(cid, raw);
            this.index(cid, parsed, [scope], Date.now() + this.leaseMs);
            this.saveSoon();
          }
        }
      }
      const maxBytes = await this.onAnnounce(scope, cid);
      if (maxBytes === false) return;
      await this.fetch(scope, cid, { maxBytes });
    } catch (err) {
      this.log(`[files] fetching announced ${cid.slice(-8)} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ---------------------------------------------------------------- lifetime

  /** Extend a file's lease to at least `ms` from now. */
  async touch(cid: string, ms = this.leaseMs): Promise<void> {
    await this.open();
    const entry = this.roots.get(cid);
    if (!entry) return;
    entry.expiresAt = Math.max(entry.expiresAt, Date.now() + ms);
    this.saveSoon();
  }

  /**
   * A record in `scope` points at this file: keep it (a full lease from now) and serve it in that
   * scope. An app calls this for the files its records reference, whenever it reads them.
   */
  async reference(scope: string, cid: string): Promise<void> {
    await this.open();
    const entry = this.roots.get(cid);
    if (!entry) return;
    const before = entry.expiresAt;
    this.index(cid, entry.manifest, [scope], Date.now() + this.leaseMs);
    // Only worth a write when the lease moved by a day or more.
    if (entry.expiresAt - before > 24 * 60 * 60 * 1000) this.saveSoon();
  }

  /** Delete files whose lease ran out, and blocks no live file uses. */
  async gc(now = Date.now()): Promise<{ files: number; blocks: number }> {
    await this.open();
    let files = 0, blocks = 0;
    for (const [cid, entry] of [...this.roots]) {
      if (entry.expiresAt > now) continue;
      this.roots.delete(cid);
      for (const c of entry.manifest.chunks) this.chunkRoots.get(c)?.delete(cid);
      await this.blocks.delete(cid);
      files++;
    }
    for (const key of await this.blocks.keys()) {
      if (key.startsWith('_') || this.roots.has(key)) continue;
      if ((this.chunkRoots.get(key)?.size ?? 0) > 0) continue;
      this.chunkRoots.delete(key);
      await this.blocks.delete(key);
      blocks++;
    }
    if (files) await this.save();
    return { files, blocks };
  }
}
