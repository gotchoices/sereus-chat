/**
 * A strand's shared drive: a directory tree on IPFS-on-a-strand, edited with MFS (`@helia/mfs`),
 * whose root CID is kept where every member sees it (a strand record, through `DriveRoot`).
 *
 * MFS keeps its root under one datastore key and caches it; here that key reads and writes the
 * strand's record, and each operation uses a fresh MFS, so it starts from the root the strand has
 * now, including one another member wrote. After a change, the new root is adopted by the blob
 * layer (served in the strand, kept from gc, provided) and the old one released (blocks the new
 * tree still uses stay).
 *
 * Concurrent edits: the root is last-writer-wins. Two members changing the drive at the same
 * moment keep only the later tree (a merge of the two trees is the open question).
 */
import { mfs, type MFS } from '@helia/mfs'
import { MemoryDatastore } from 'datastore-core'
import { Key } from 'interface-datastore'
import { NotFoundError } from 'interface-store'
import { CID } from 'multiformats/cid'
import { defaultLogger } from '@libp2p/logger'
import type { StrandBlobs } from '@chat/strand-blobs'
import type { Blockstore } from 'interface-blockstore'
import type { AbortOptions } from 'abort-error'

/** Where the drive's root lives: the strand's record of it. */
export interface DriveRoot {
  /** The current root CID, or null for an empty drive. */
  load(): Promise<string | null>
  /** Record a new root (`previous` is the root the change started from). */
  save(cid: string, previous: string | null): Promise<void>
}

const ROOT_KEY = new Key('/locals/filesroot')

/** A datastore whose one MFS key is the drive's root record. */
class RootDatastore extends MemoryDatastore {
  started: string | null = null
  constructor (private readonly root: DriveRoot) { super() }

  override async get (key: Key, options?: AbortOptions): Promise<Uint8Array> {
    if (key.toString() !== ROOT_KEY.toString()) return super.get(key, options)
    const cid = await this.root.load()
    this.started = cid
    if (cid == null) throw new NotFoundError('the drive is empty')
    return CID.parse(cid).bytes
  }

  override async has (key: Key, options?: AbortOptions): Promise<boolean> {
    if (key.toString() !== ROOT_KEY.toString()) return super.has(key, options)
    return (await this.root.load()) != null
  }

  override async put (key: Key, value: Uint8Array, options?: AbortOptions): Promise<Key> {
    if (key.toString() !== ROOT_KEY.toString()) return super.put(key, value, options)
    await this.root.save(CID.decode(value).toString(), this.started)
    return key
  }
}

export interface StrandDriveInit {
  /** The strand. */
  scope: string
  /** Read and write blocks through this (a StrandIpfs's networked block store). */
  blockstore: () => Blockstore
  blobs: StrandBlobs
  root: DriveRoot
}

export class StrandDrive {
  constructor (private readonly init: StrandDriveInit) {}

  /** One MFS for one operation, from the root the strand has now. */
  private fs (): { fs: MFS, ds: RootDatastore } {
    const ds = new RootDatastore(this.init.root)
    return { fs: mfs({ blockstore: this.init.blockstore(), datastore: ds, logger: defaultLogger() }), ds }
  }

  /** Run a change, then keep the new tree and let the old go. */
  private async change (op: (fs: MFS) => Promise<void>): Promise<void> {
    const before = await this.init.root.load()
    const { fs } = this.fs()
    await op(fs)
    const after = await this.init.root.load()
    if (after != null && after !== before) {
      await this.init.blobs.adopt(this.init.scope, after)
      if (before != null) await this.init.blobs.release(before)
    }
  }

  writeBytes (path: string, bytes: Uint8Array): Promise<void> { return this.change(fs => fs.writeBytes(bytes, path)) }
  writeStream (path: string, bytes: AsyncIterable<Uint8Array>): Promise<void> { return this.change(fs => fs.writeByteStream(bytes, path)) }
  mkdir (path: string): Promise<void> { return this.change(fs => fs.mkdir(path, { parents: true } as never)) }
  rm (path: string): Promise<void> { return this.change(fs => fs.rm(path, { recursive: true } as never)) }
  cp (from: string, to: string): Promise<void> { return this.change(fs => fs.cp(from, to)) }

  /** The entries of a directory, fetching what is not here from the strand. */
  async * ls (path = '/'): AsyncGenerator<{ name: string, cid: string }> {
    const { fs } = this.fs()
    for await (const e of fs.ls(path)) yield { name: e.name, cid: e.cid.toString() }
  }

  /** A file's bytes, fetching what is not here from the strand. */
  cat (path: string): AsyncIterable<Uint8Array> {
    return this.fs().fs.cat(path)
  }

  async stat (path: string): Promise<{ type: string, cid: string, size: number }> {
    const s = await this.fs().fs.stat(path)
    return { type: s.type, cid: s.cid.toString(), size: Number(s.size) }
  }
}
