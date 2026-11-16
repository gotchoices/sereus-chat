/**
 * A strand's shared drive (SPEC.md): folders and files as rows in the strand's database, each file
 * naming a blob. This class reads and writes those rows under the spec's rules. It doesn't store
 * bytes: the caller puts a file's bytes in its blob layer first and passes the blob's ref, and it
 * keeps alive the blobs that `list` returns.
 *
 * It needs only a database that runs SQL (`exec`, `eval`: Quereus's, on the strand), the schema
 * the fragment was merged into, and the table prefix.
 */
import { DEFAULT_PREFIX } from './schema.js'

export type KeepFor = 'day' | 'week' | 'month' | 'year'
export const KEEP_FOR_MS: Record<KeepFor, number> = {
  day: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
  year: 365 * 24 * 60 * 60 * 1000
}
export const DEFAULT_KEEP_FOR: KeepFor = 'month'

export type AddPolicy = 'anyone' | 'creator'

/** The database the drive's rows live in. */
export interface DriveDb {
  exec(sql: string, params?: unknown[]): Promise<unknown>
  eval(sql: string, params?: unknown[]): AsyncIterable<Record<string, unknown>>
}

export interface DriveFolder {
  id: string
  parentId: string | null
  name: string
  createdBy: string
  createdAt: string
  addPolicy: AddPolicy
  /** The viewer created it: may rename, move, remove it, and set who adds in it. */
  mine: boolean
  /** The viewer may add files and folders in it. */
  canAdd: boolean
}

export interface DriveFile {
  id: string
  folderId: string | null
  name: string
  blob: string
  size: number
  mimeType: string | null
  addedBy: string
  addedAt: string
  expiresAt: string
  /** A short code telling same-named files apart: the end of the content's id. */
  fingerprint: string
  /** The viewer added it: may rename, move, remove it. */
  mine: boolean
}

export interface DriveListing {
  /** The folder listed, or null for the top level. */
  folder: DriveFolder | null
  /** From the top level down to the folder listed (excluding it). */
  path: DriveFolder[]
  /** The viewer may add here. */
  canAdd: boolean
  folders: DriveFolder[]
  files: DriveFile[]
}

export class DriveError extends Error {
  constructor (readonly kind: 'not-allowed' | 'not-found' | 'invalid', message: string) {
    super(message)
    this.name = 'DriveError'
  }
}

export interface StrandDriveInit {
  /** The strand's database (may change: a strand reopens). */
  db: () => DriveDb | Promise<DriveDb>
  /** The viewer's member id (the same id the app's member rows use). */
  me: () => string
  /** The schema the fragment was merged into (chat: `App`). */
  schema?: string
  prefix?: string
  newId?: () => string
  now?: () => Date
}

interface FolderRow { Id: string, ParentId: string | null, Name: string, CreatedBy: string, CreatedAt: string, AddPolicy: string }
interface FileRow { Id: string, FolderId: string | null, Name: string, Blob: string, Size: number, MimeType: string | null, AddedBy: string, AddedAt: string, ExpiresAt: string }

const randomId = (): string => (globalThis as { crypto: { randomUUID(): string } }).crypto.randomUUID()

export class StrandDrive {
  private readonly folderTable: string
  private readonly fileTable: string
  private readonly newId: () => string
  private readonly now: () => Date

  constructor (private readonly init: StrandDriveInit) {
    const schema = init.schema ?? 'App'
    const prefix = init.prefix ?? DEFAULT_PREFIX
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(schema) || !/^[A-Za-z][A-Za-z0-9_]*$/.test(prefix)) throw new Error('bad schema or prefix')
    this.folderTable = `${schema}.${prefix}Folder`
    this.fileTable = `${schema}.${prefix}File`
    this.newId = init.newId ?? randomId
    this.now = init.now ?? (() => new Date())
  }

  // ------------------------------------------------------------------ reading

  private async rows<T> (sql: string, params: unknown[] = []): Promise<T[]> {
    const db = await this.init.db()
    const out: T[] = []
    for await (const r of db.eval(sql, params)) out.push(r as T)
    return out
  }

  private async folders (): Promise<FolderRow[]> {
    return this.rows<FolderRow>(`select Id, ParentId, Name, CreatedBy, CreatedAt, AddPolicy from ${this.folderTable}`)
  }

  private async files (): Promise<FileRow[]> {
    return this.rows<FileRow>(`select Id, FolderId, Name, Blob, Size, MimeType, AddedBy, AddedAt, ExpiresAt from ${this.fileTable}`)
  }

  private toFolder (r: FolderRow): DriveFolder {
    const me = this.init.me()
    const addPolicy: AddPolicy = r.AddPolicy === 'creator' ? 'creator' : 'anyone'
    return {
      id: r.Id,
      parentId: r.ParentId ?? null,
      name: r.Name,
      createdBy: r.CreatedBy,
      createdAt: r.CreatedAt,
      addPolicy,
      mine: r.CreatedBy === me,
      canAdd: addPolicy === 'anyone' || r.CreatedBy === me
    }
  }

  private toFile (r: FileRow): DriveFile {
    const tail = r.Blob.replace(/^[a-z]+:/, '')
    return {
      id: r.Id,
      folderId: r.FolderId ?? null,
      name: r.Name,
      blob: r.Blob,
      size: Number(r.Size),
      mimeType: r.MimeType ?? null,
      addedBy: r.AddedBy,
      addedAt: r.AddedAt,
      expiresAt: r.ExpiresAt,
      fingerprint: tail.slice(-6),
      mine: r.AddedBy === this.init.me()
    }
  }

  /**
   * Where each folder is shown: its parent, or the top level (null) when the parent hasn't arrived
   * yet or when a cycle of concurrent moves reached it. A cycle is broken at its folder with the
   * smallest id, the same choice on every device.
   */
  private placement (rows: FolderRow[]): Map<string, string | null> {
    const byId = new Map(rows.map(r => [r.Id, r]))
    const placed = new Map<string, string | null>()
    for (const r of rows) placed.set(r.Id, r.ParentId != null && byId.has(r.ParentId) ? r.ParentId : null)
    for (const r of rows) {
      const seen: string[] = []
      let at: string | null = r.Id
      while (at != null && !seen.includes(at)) { seen.push(at); at = placed.get(at) ?? null }
      if (at != null) {
        // A cycle: from `at` round to `at` again.
        const cycle: string[] = []
        let c: string = at
        do { cycle.push(c); c = placed.get(c)! } while (c !== at)
        const breakAt = [...cycle].sort()[0]
        placed.set(breakAt, null)
      }
    }
    return placed
  }

  private live (f: FileRow): boolean {
    return f.ExpiresAt > this.now().toISOString()
  }

  /** The folders and unexpired files directly in `folderId` (null: the top level). */
  async list (folderId: string | null = null): Promise<DriveListing> {
    const [folderRows, fileRows] = await Promise.all([this.folders(), this.files()])
    const placed = this.placement(folderRows)
    const byId = new Map(folderRows.map(r => [r.Id, r]))
    if (folderId != null && !byId.has(folderId)) throw new DriveError('not-found', 'That folder is not in the drive (removed, or not arrived yet).')
    const folder = folderId != null ? this.toFolder(byId.get(folderId)!) : null
    const path: DriveFolder[] = []
    for (let up = folderId != null ? placed.get(folderId) ?? null : null; up != null; up = placed.get(up) ?? null) {
      path.unshift(this.toFolder(byId.get(up)!))
    }
    const byName = <T extends { name: string }>(a: T, b: T): number => a.name.localeCompare(b.name)
    return {
      folder,
      path,
      canAdd: folder?.canAdd ?? true,
      folders: folderRows.filter(r => (placed.get(r.Id) ?? null) === folderId).map(r => this.toFolder(r)).sort(byName),
      files: fileRows
        .filter(f => this.live(f) && (f.FolderId != null && byId.has(f.FolderId) ? f.FolderId : null) === folderId)
        .map(f => this.toFile(f))
        .sort((a, b) => byName(a, b) || a.addedAt.localeCompare(b.addedAt))
    }
  }

  /** One file, if it is in the drive and unexpired. */
  async file (fileId: string): Promise<DriveFile | null> {
    const rows = await this.rows<FileRow>(`select Id, FolderId, Name, Blob, Size, MimeType, AddedBy, AddedAt, ExpiresAt from ${this.fileTable} where Id = ?`, [fileId])
    const r = rows[0]
    return r != null && this.live(r) ? this.toFile(r) : null
  }

  /** Every blob a live file names (the app keeps these alive). */
  async blobs (): Promise<string[]> {
    return [...new Set((await this.files()).filter(f => this.live(f)).map(f => f.Blob))]
  }

  // ------------------------------------------------------------------ writing

  private async folderRow (id: string): Promise<FolderRow> {
    const r = (await this.rows<FolderRow>(`select Id, ParentId, Name, CreatedBy, CreatedAt, AddPolicy from ${this.folderTable} where Id = ?`, [id]))[0]
    if (r == null) throw new DriveError('not-found', 'That folder is not in the drive.')
    return r
  }

  private async fileRow (id: string): Promise<FileRow> {
    const r = (await this.rows<FileRow>(`select Id, FolderId, Name, Blob, Size, MimeType, AddedBy, AddedAt, ExpiresAt from ${this.fileTable} where Id = ?`, [id]))[0]
    if (r == null) throw new DriveError('not-found', 'That file is not in the drive.')
    return r
  }

  /** May the viewer add in `folderId` (null: the top level, where anyone may)? */
  private async mayAddIn (folderId: string | null): Promise<void> {
    if (folderId == null) return
    const f = this.toFolder(await this.folderRow(folderId))
    if (!f.canAdd) throw new DriveError('not-allowed', `Only the person who made "${f.name}" can add to it.`)
  }

  private name (name: string, max: number): string {
    const n = name.trim()
    if (n.length < 1 || n.length > max) throw new DriveError('invalid', `A name is 1 to ${max} characters.`)
    return n
  }

  async addFolder (parentId: string | null, name: string, addPolicy: AddPolicy = 'anyone'): Promise<DriveFolder> {
    await this.mayAddIn(parentId)
    const row: FolderRow = { Id: this.newId(), ParentId: parentId, Name: this.name(name, 200), CreatedBy: this.init.me(), CreatedAt: this.now().toISOString(), AddPolicy: addPolicy }
    const db = await this.init.db()
    await db.exec(`insert into ${this.folderTable} (Id, ParentId, Name, CreatedBy, CreatedAt, AddPolicy) values (?, ?, ?, ?, ?, ?)`,
      [row.Id, row.ParentId, row.Name, row.CreatedBy, row.CreatedAt, row.AddPolicy])
    return this.toFolder(row)
  }

  /** Record a file whose bytes are already a blob (`blob`: its ref). */
  async addFile (folderId: string | null, file: { name: string, blob: string, size: number, mimeType?: string | null, keepFor?: KeepFor }): Promise<DriveFile> {
    await this.mayAddIn(folderId)
    const now = this.now()
    const row: FileRow = {
      Id: this.newId(),
      FolderId: folderId,
      Name: this.name(file.name, 255),
      Blob: file.blob,
      Size: file.size,
      MimeType: file.mimeType ?? null,
      AddedBy: this.init.me(),
      AddedAt: now.toISOString(),
      ExpiresAt: new Date(now.getTime() + KEEP_FOR_MS[file.keepFor ?? DEFAULT_KEEP_FOR]).toISOString()
    }
    const db = await this.init.db()
    await db.exec(`insert into ${this.fileTable} (Id, FolderId, Name, Blob, Size, MimeType, AddedBy, AddedAt, ExpiresAt) values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [row.Id, row.FolderId, row.Name, row.Blob, row.Size, row.MimeType, row.AddedBy, row.AddedAt, row.ExpiresAt])
    return this.toFile(row)
  }

  /** Is `id` the folder `target` or one of its ancestors (so a move would put a folder inside itself)? */
  private async isAncestorOrSelf (id: string, target: string | null): Promise<boolean> {
    const placed = this.placement(await this.folders())
    for (let at = target; at != null; at = placed.get(at) ?? null) if (at === id) return true
    return false
  }

  async rename (kind: 'folder' | 'file', id: string, name: string): Promise<void> {
    const db = await this.init.db()
    if (kind === 'folder') {
      const f = await this.folderRow(id)
      if (f.CreatedBy !== this.init.me()) throw new DriveError('not-allowed', 'Only the person who made a folder can rename it.')
      await db.exec(`update ${this.folderTable} set Name = ? where Id = ?`, [this.name(name, 200), id])
    } else {
      const f = await this.fileRow(id)
      if (f.AddedBy !== this.init.me()) throw new DriveError('not-allowed', 'Only the person who added a file can rename it.')
      await db.exec(`update ${this.fileTable} set Name = ? where Id = ?`, [this.name(name, 255), id])
    }
  }

  async move (kind: 'folder' | 'file', id: string, to: string | null): Promise<void> {
    await this.mayAddIn(to)
    const db = await this.init.db()
    if (kind === 'folder') {
      const f = await this.folderRow(id)
      if (f.CreatedBy !== this.init.me()) throw new DriveError('not-allowed', 'Only the person who made a folder can move it.')
      if (await this.isAncestorOrSelf(id, to)) throw new DriveError('invalid', 'A folder cannot go inside itself.')
      await db.exec(`update ${this.folderTable} set ParentId = ? where Id = ?`, [to, id])
    } else {
      const f = await this.fileRow(id)
      if (f.AddedBy !== this.init.me()) throw new DriveError('not-allowed', 'Only the person who added a file can move it.')
      await db.exec(`update ${this.fileTable} set FolderId = ? where Id = ?`, [to, id])
    }
  }

  async setAddPolicy (folderId: string, policy: AddPolicy): Promise<void> {
    const f = await this.folderRow(folderId)
    if (f.CreatedBy !== this.init.me()) throw new DriveError('not-allowed', 'Only the person who made a folder can choose who adds to it.')
    const db = await this.init.db()
    await db.exec(`update ${this.folderTable} set AddPolicy = ? where Id = ?`, [policy, folderId])
  }

  /** Keep a file at least `keepFor` from now (any member; never sooner than it was). */
  async keep (fileId: string, keepFor: KeepFor): Promise<DriveFile> {
    const f = await this.fileRow(fileId)
    const until = new Date(this.now().getTime() + KEEP_FOR_MS[keepFor]).toISOString()
    if (until > f.ExpiresAt) {
      const db = await this.init.db()
      await db.exec(`update ${this.fileTable} set ExpiresAt = ? where Id = ?`, [until, fileId])
      f.ExpiresAt = until
    }
    return this.toFile(f)
  }

  async remove (kind: 'folder' | 'file', id: string): Promise<void> {
    const db = await this.init.db()
    if (kind === 'file') {
      const f = await this.fileRow(id)
      if (f.AddedBy !== this.init.me() && this.live(f)) throw new DriveError('not-allowed', 'Only the person who added a file can remove it.')
      await db.exec(`delete from ${this.fileTable} where Id = ?`, [id])
      return
    }
    const f = await this.folderRow(id)
    const me = this.init.me()
    if (f.CreatedBy !== me) throw new DriveError('not-allowed', 'Only the person who made a folder can remove it.')
    // Not while it holds anything of anyone else's (live files, or folders), anywhere beneath it.
    const [folderRows, fileRows] = await Promise.all([this.folders(), this.files()])
    const placed = this.placement(folderRows)
    const under = (start: string): Set<string> => {
      const out = new Set<string>([start])
      for (let grew = true; grew;) {
        grew = false
        for (const r of folderRows) if (!out.has(r.Id) && out.has(placed.get(r.Id) ?? '')) { out.add(r.Id); grew = true }
      }
      return out
    }
    const tree = under(id)
    const othersFolders = folderRows.filter(r => tree.has(r.Id) && r.CreatedBy !== me)
    const othersFiles = fileRows.filter(r => r.FolderId != null && tree.has(r.FolderId) && r.AddedBy !== me && this.live(r))
    if (othersFolders.length > 0 || othersFiles.length > 0) {
      throw new DriveError('not-allowed', 'This folder holds things other people added; it can be removed once they are gone.')
    }
    // The viewer's own things beneath it go with it.
    for (const r of fileRows) if (r.FolderId != null && tree.has(r.FolderId)) await db.exec(`delete from ${this.fileTable} where Id = ?`, [r.Id])
    for (const fid of [...tree].reverse()) await db.exec(`delete from ${this.folderTable} where Id = ?`, [fid])
  }

  /** Remove expired files' rows (any member may); resolves to how many. */
  async removeExpired (): Promise<number> {
    const now = this.now().toISOString()
    const expired = (await this.files()).filter(f => f.ExpiresAt <= now)
    const db = await this.init.db()
    for (const f of expired) await db.exec(`delete from ${this.fileTable} where Id = ?`, [f.Id])
    return expired.length
  }
}
