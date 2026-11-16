/**
 * A strand's shared drive (story 23): `drive <strand> <verb> …`. Folders and files are named
 * by path from the top (`Routes/Saturday/summit.jpg`); a file among same-named ones by
 * `name~fingerprint` (as `ls` shows it); anything by its id.
 */
import type { DriveFile, DriveFolder, DriveListing, KeepFor, Result } from '@chat/core';
import { basename } from 'node:path';
import { copyFile } from 'node:fs/promises';
import { UsageError, type Session } from '../session.js';
import type { Row } from '../output.js';
import { need, type Command } from './command.js';
import { kindOf } from './strands.js';

const KEEP: KeepFor[] = ['day', 'week', 'month', 'year'];
export const DRIVE_COLUMNS = ['kind', 'name', 'id', 'bytes', 'by', 'added', 'expires', 'fingerprint', 'here', 'policy'] as const;

export type Found = { kind: 'top' } | { kind: 'folder'; folder: DriveFolder } | { kind: 'file'; file: DriveFile };
type List = (folderId: string | null) => Promise<DriveListing>;

/** What a path (or an id) names in the drive, or a usage error saying why not. */
export async function resolveDrivePath(ref: string, list: List): Promise<Found> {
  const parts = ref.split('/').filter(Boolean);
  if (!parts.length) return { kind: 'top' };
  let at: string | null = null;
  try {
    let found: Found = { kind: 'top' };
    for (const [i, part] of parts.entries()) {
      const l = await list(at);
      const last = i === parts.length - 1;
      const folders = l.folders.filter(f => f.name === part || f.id === part);
      const [name, fingerprint] = part.includes('~') ? [part.slice(0, part.lastIndexOf('~')), part.slice(part.lastIndexOf('~') + 1)] : [part, null];
      const files = last ? l.files.filter(f => f.id === part || (f.name === name && (!fingerprint || f.fingerprint === fingerprint))) : [];
      if (folders.length + files.length > 1) {
        throw new UsageError(`drive: "${part}" names ${folders.length + files.length} things here; add ~fingerprint (${files.map(f => `${f.name}~${f.fingerprint}`).join(', ')}) or use an id`);
      }
      if (folders.length) { at = folders[0].id; found = { kind: 'folder', folder: folders[0] }; continue; }
      if (files.length) return { kind: 'file', file: files[0] };
      throw new NotHere(part);
    }
    return found;
  } catch (err) {
    if (!(err instanceof NotHere) || parts.length !== 1) throw err;
    // One word that is no name at the top: an id anywhere in the drive.
    const byId = await findId(parts[0], list);
    if (byId) return byId;
    throw new UsageError(`drive: nothing called "${ref}" (see "drive <strand> ls")`);
  }
}

class NotHere extends UsageError {
  constructor(part: string) { super(`drive: no "${part}" there (see "drive <strand> ls")`); }
}

async function findId(id: string, list: List): Promise<Found | null> {
  const queue: Array<string | null> = [null];
  while (queue.length) {
    const l = await list(queue.shift()!);
    const folder = l.folders.find(f => f.id === id);
    if (folder) return { kind: 'folder', folder };
    const file = l.files.find(f => f.id === id);
    if (file) return { kind: 'file', file };
    queue.push(...l.folders.map(f => f.id));
  }
  return null;
}

const folderRow = (f: DriveFolder): Row => ({ kind: 'folder', name: `${f.name}/`, id: f.id, by: f.createdByName, added: f.createdAt, policy: f.addPolicy });
const fileRow = (f: DriveFile): Row => ({
  kind: 'file', name: f.name, id: f.id, bytes: f.size, by: f.addedByName, added: f.addedAt, expires: f.expiresAt, fingerprint: f.fingerprint, here: f.here,
});

function keepFor(value: unknown): KeepFor {
  if (value === undefined) return 'month';
  if (!KEEP.includes(value as KeepFor)) throw new UsageError(`drive: keep for ${KEEP.join(', ')}`);
  return value as KeepFor;
}

const drive: Command = {
  name: 'drive',
  summary: "A strand's shared drive: ls, mkdir, add, get, mv, rename, keep, rm, policy",
  usage: '<strand> [ls [<folder>]]'
    + ' | mkdir <path> [--creator]'
    + ' | add <file>... [--to <folder>] [--keep day|week|month|year] [--name <name>]'
    + ' | get <file> [-o <file>]'
    + ' | mv <path> <folder>'
    + ' | rename <path> <name>'
    + ' | keep <file> day|week|month|year'
    + ' | rm <path>'
    + ' | policy <folder> anyone|creator',
  options: {
    creator: { type: 'boolean' }, to: { type: 'string' }, keep: { type: 'string' },
    name: { type: 'string' }, out: { type: 'string', short: 'o' },
  },
  async run(session, args, values) {
    const strand = await session.strand(need(drive, args, 0, 'strand'));
    const [verb = 'ls', ...rest] = args.slice(1);
    const s = strand.id;
    const got = <T>(r: Result<T>) => session.unwrap(r);
    const list: List = async folderId => got(await session.model.drive.list(s, folderId));
    const at = (ref: string) => resolveDrivePath(ref, list);
    const folderAt = async (ref: string | undefined): Promise<string | null> => {
      if (!ref) return null;
      const found = await at(ref);
      if (found.kind === 'file') throw new UsageError(`drive: "${ref}" is a file, not a folder`);
      return found.kind === 'folder' ? found.folder.id : null;
    };
    const thing = async (ref: string) => {
      const found = await at(ref);
      if (found.kind === 'top') throw new UsageError('drive: name a folder or file, not the top');
      return found.kind === 'folder' ? { kind: 'folder' as const, id: found.folder.id } : { kind: 'file' as const, id: found.file.id };
    };
    const fileAt = async (ref: string) => {
      const found = await at(ref);
      if (found.kind !== 'file') throw new UsageError(`drive: "${ref}" is not a file`);
      return found.file;
    };
    const arg = (i: number, what: string) => need({ name: `drive ${verb}`, usage: drive.usage }, rest, i, what);

    switch (verb) {
      case 'ls': {
        const l = got(await session.model.drive.list(s, await folderAt(rest[0])));
        session.out.rows(DRIVE_COLUMNS, [...l.folders.map(folderRow), ...l.files.map(fileRow)]);
        return;
      }
      case 'mkdir': {
        const path = arg(0, 'path').split('/').filter(Boolean);
        const name = path.pop();
        if (!name) throw new UsageError('drive mkdir: missing a name');
        const parent = await folderAt(path.join('/'));
        const made = got(await session.model.drive.addFolder(s, parent, name, { addPolicy: values.creator ? 'creator' : 'anyone' }));
        session.out.rows(DRIVE_COLUMNS, [folderRow(made)]);
        return;
      }
      case 'add': {
        if (!rest.length) throw new UsageError(`drive add: name a file\nusage: drive ${drive.usage}`);
        if (values.name && rest.length > 1) throw new UsageError('drive add: --name takes one file');
        const folderId = await folderAt(values.to as string | undefined);
        const keep = keepFor(values.keep);
        for (const path of rest) {
          const started = Date.now();
          const added = got(await session.model.drive.addFile(s, folderId, {
            uri: path, name: (values.name as string | undefined) ?? basename(path), mimeType: kindOf(path).mimeType, keepFor: keep,
          }));
          session.out.rows([...DRIVE_COLUMNS, 'addMs'], [{ ...fileRow(added), addMs: Date.now() - started }]);
        }
        return;
      }
      case 'get': {
        const file = await fileAt(arg(0, 'file'));
        const started = Date.now();
        const { uri } = got(await session.model.drive.open(s, file.id));
        const out = values.out as string | undefined;
        if (out) await copyFile(uri, out);
        session.out.rows(['name', 'id', 'bytes', 'path', 'fetchMs'], [{ name: file.name, id: file.id, bytes: file.size, path: out ?? uri, fetchMs: Date.now() - started }]);
        return;
      }
      case 'mv': {
        const what = await thing(arg(0, 'path'));
        got(await session.model.drive.move(s, what.kind, what.id, await folderAt(arg(1, 'folder (/ for the top)'))));
        return;
      }
      case 'rename': {
        const what = await thing(arg(0, 'path'));
        got(await session.model.drive.rename(s, what.kind, what.id, arg(1, 'name')));
        return;
      }
      case 'keep': {
        const file = await fileAt(arg(0, 'file'));
        session.out.rows(DRIVE_COLUMNS, [fileRow(got(await session.model.drive.keep(s, file.id, keepFor(arg(1, 'how long')))))]);
        return;
      }
      case 'rm': {
        const what = await thing(arg(0, 'path'));
        got(await session.model.drive.remove(s, what.kind, what.id));
        return;
      }
      case 'policy': {
        const folderId = await folderAt(arg(0, 'folder'));
        const policy = arg(1, 'anyone or creator');
        if (!folderId) throw new UsageError('drive policy: anyone adds at the top');
        if (policy !== 'anyone' && policy !== 'creator') throw new UsageError('drive policy: anyone or creator');
        got(await session.model.drive.setAddPolicy(s, folderId, policy));
        return;
      }
      default:
        throw new UsageError(`drive: no "${verb}"\nusage: drive ${drive.usage}`);
    }
  },
};

export const driveCommands = [drive];
