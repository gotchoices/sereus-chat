/**
 * The drive's rules (SPEC.md) against a real Quereus database, the fragment applied as sereus
 * applies an sApp schema (`declare schema App { … }; apply schema App;`). Two members share one
 * database, standing in for a strand's replicated one.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { Database } from '@quereus/quereus'
import { StrandDrive, DriveError, driveSchema, type DriveDb } from './index.js'

let db: Database
let clock = Date.parse('2026-11-15T12:00:00Z')
const now = (): Date => new Date(clock)
const as = (me: string): StrandDrive => new StrandDrive({ db: () => db as unknown as DriveDb, me: () => me, now })
const blob = (n: number): string => `ipfs:bafkreiexample${String(n).padStart(6, '0')}`

beforeEach(async () => {
  db = new Database()
  await db.exec(`declare schema App { ${driveSchema()} }; apply schema App;`)
  clock = Date.parse('2026-11-15T12:00:00Z')
})

const names = (l: { folders: Array<{ name: string }>, files: Array<{ name: string }> }): string[] =>
  [...l.folders.map(f => `${f.name}/`), ...l.files.map(f => f.name)]

describe('a strand drive', () => {
  it('folders and files, seen alike by every member', async () => {
    const priya = as('priya'); const bob = as('bob')
    const routes = await priya.addFolder(null, 'Routes')
    await priya.addFile(routes.id, { name: 'loop.gpx', blob: blob(1), size: 1200, mimeType: 'application/gpx+xml', keepFor: 'year' })
    await bob.addFile(null, { name: 'waiver.pdf', blob: blob(2), size: 50_000 })
    expect(names(await bob.list())).toEqual(['Routes/', 'waiver.pdf'])
    const inRoutes = await bob.list(routes.id)
    expect(names(inRoutes)).toEqual(['loop.gpx'])
    expect(inRoutes.files[0].mine).toBe(false)
    expect(inRoutes.path).toEqual([])
    expect((await priya.list(routes.id)).files[0].mine).toBe(true)
  })

  it('a folder only its creator adds to', async () => {
    const priya = as('priya'); const bob = as('bob')
    const routes = await priya.addFolder(null, 'Routes', 'creator')
    expect((await bob.list(routes.id)).canAdd).toBe(false)
    await expect(bob.addFile(routes.id, { name: 'x', blob: blob(3), size: 1 })).rejects.toMatchObject({ kind: 'not-allowed' })
    await expect(bob.setAddPolicy(routes.id, 'anyone')).rejects.toBeInstanceOf(DriveError)
    await priya.setAddPolicy(routes.id, 'anyone')
    await bob.addFile(routes.id, { name: 'x', blob: blob(3), size: 1 })
  })

  it('same names never replace each other', async () => {
    await as('susan').addFile(null, { name: 'waiver.pdf', blob: blob(4), size: 1 })
    await as('bob').addFile(null, { name: 'waiver.pdf', blob: blob(5), size: 1 })
    const files = (await as('priya').list()).files
    expect(files.map(f => f.name)).toEqual(['waiver.pdf', 'waiver.pdf'])
    expect(new Set(files.map(f => f.fingerprint)).size).toBe(2)
  })

  it('only authors rename, move and remove their files; anyone keeps one longer', async () => {
    const bob = as('bob'); const susan = as('susan')
    const f = await bob.addFile(null, { name: 'summit.jpg', blob: blob(6), size: 1, keepFor: 'week' })
    await expect(susan.rename('file', f.id, 'mine.jpg')).rejects.toMatchObject({ kind: 'not-allowed' })
    await expect(susan.remove('file', f.id)).rejects.toMatchObject({ kind: 'not-allowed' })
    const kept = await susan.keep(f.id, 'year')
    expect(kept.expiresAt > f.expiresAt).toBe(true)
    // Keeping for less never shortens it.
    expect((await susan.keep(f.id, 'day')).expiresAt).toBe(kept.expiresAt)
    await bob.rename('file', f.id, 'summit-2026.jpg')
    expect((await bob.list()).files[0].name).toBe('summit-2026.jpg')
    await bob.remove('file', f.id)
    expect((await bob.list()).files).toEqual([])
  })

  it('files expire for everyone, and any member may then remove them', async () => {
    const bob = as('bob')
    await bob.addFile(null, { name: 'old.jpg', blob: blob(7), size: 1, keepFor: 'day' })
    await bob.addFile(null, { name: 'kept.jpg', blob: blob(8), size: 1, keepFor: 'month' })
    clock += 2 * 24 * 60 * 60 * 1000
    expect(names(await as('susan').list())).toEqual(['kept.jpg'])
    expect(await as('susan').blobs()).toEqual([blob(8)])
    expect(await as('susan').removeExpired()).toBe(1)
  })

  it("a folder goes only when nothing of anyone else's is in it", async () => {
    const bob = as('bob'); const susan = as('susan')
    const rides = await bob.addFolder(null, 'Ride photos')
    const inner = await bob.addFolder(rides.id, 'Saturday')
    await bob.addFile(inner.id, { name: 'a.jpg', blob: blob(9), size: 1 })
    const hers = await susan.addFile(inner.id, { name: 'b.jpg', blob: blob(10), size: 1 })
    await expect(susan.remove('folder', rides.id)).rejects.toMatchObject({ kind: 'not-allowed' })
    await expect(bob.remove('folder', rides.id)).rejects.toMatchObject({ kind: 'not-allowed' })
    await susan.remove('file', hers.id)
    await bob.remove('folder', rides.id)
    expect(names(await bob.list())).toEqual([])
  })

  it('moves: never into itself; a cycle from concurrent moves is broken the same way everywhere', async () => {
    const bob = as('bob')
    const a = await bob.addFolder(null, 'A')
    const b = await bob.addFolder(a.id, 'B')
    await expect(bob.move('folder', a.id, b.id)).rejects.toMatchObject({ kind: 'invalid' })
    // Two devices' moves, each valid on its own, crossing: A into B and B into A.
    await db.exec('update App.DriveFolder set ParentId = ? where Id = ?', [b.id, a.id])
    const top = await as('susan').list()
    const breakAt = [a.id, b.id].sort()[0]
    expect(top.folders.map(f => f.id)).toEqual([breakAt])
    const other = breakAt === a.id ? b : a
    expect((await as('susan').list(breakAt)).folders.map(f => f.id)).toEqual([other.id])
    expect((await as('susan').list(other.id)).path.map(f => f.id)).toEqual([breakAt])
  })

  it('a file whose folder has not arrived shows at the top', async () => {
    await db.exec('insert into App.DriveFile (Id, FolderId, Name, Blob, Size, MimeType, AddedBy, AddedAt, ExpiresAt) values (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ['f-early', 'folder-not-here-yet', 'early.jpg', blob(11), 1, null, 'bob', now().toISOString(), new Date(clock + 1e9).toISOString()])
    expect(names(await as('priya').list())).toEqual(['early.jpg'])
  })
})
