/**
 * Block storage for the strand file layer (`@chat/core/files`, gotchoices/sereus#62) on the
 * phone, over react-native-file-access: one file per block in the app's documents directory,
 * named by its key (a base32 CID, or the layer's own `_index`). Not the cache directory: this
 * phone serves these blocks to the strand's members, so Android must not clear them.
 *
 * The library speaks base64 strings across the bridge; `uint8arrays` converts. Writes go
 * through a temporary file, so a reader never sees half a block.
 */
import { Dirs, FileSystem } from 'react-native-file-access';
import { fromString, toString } from 'uint8arrays';
import type { BlockStore } from '@chat/core/files';

const DIR = `${Dirs.DocumentDir}/file-blocks`;

const pathOf = (key: string) => {
  if (!/^[A-Za-z0-9_]+$/.test(key)) throw new Error(`not a block key: ${key}`);
  return `${DIR}/${key}`;
};

let made: Promise<void> | null = null;
const ready = () => (made ??= (async () => {
  if (!(await FileSystem.exists(DIR))) await FileSystem.mkdir(DIR);
})());

export const phoneBlocks: BlockStore = {
  async get(key) {
    const p = pathOf(key);
    if (!(await FileSystem.exists(p))) return null;
    return fromString(await FileSystem.readFile(p, 'base64'), 'base64pad');
  },
  async put(key, bytes) {
    await ready();
    const p = pathOf(key);
    const tmp = `${p}.part`;
    await FileSystem.writeFile(tmp, toString(bytes, 'base64pad'), 'base64');
    if (await FileSystem.exists(p)) await FileSystem.unlink(p);
    await FileSystem.mv(tmp, p);
  },
  async has(key) {
    return FileSystem.exists(pathOf(key));
  },
  async delete(key) {
    const p = pathOf(key);
    if (await FileSystem.exists(p)) await FileSystem.unlink(p);
  },
  async keys() {
    if (!(await FileSystem.exists(DIR))) return [];
    return (await FileSystem.ls(DIR)).filter(n => !n.endsWith('.part'));
  },
  // A file to send, cut into blocks natively: each chunk goes from the file to a block file as
  // the base64 string the bridge carries anyway, and is hashed in native code; its bytes never
  // become a JavaScript array (seconds per MB on the S7).
  async importFile(source, chunkSize, name) {
    await ready();
    const p = source.startsWith('file://') ? decodeURI(source.slice('file://'.length)) : source;
    const size = (await FileSystem.stat(p)).size;
    const keys: string[] = [];
    const tmp = `${DIR}/import.part`;
    for (let at = 0; at < size; at += chunkSize) {
      const b64 = await FileSystem.readFileChunk(p, at, Math.min(chunkSize, size - at), 'base64');
      await FileSystem.writeFile(tmp, b64, 'base64');
      const key = name(await FileSystem.hash(tmp, 'SHA-256'));
      const target = pathOf(key);
      if (await FileSystem.exists(target)) await FileSystem.unlink(tmp);
      else await FileSystem.mv(tmp, target);
      keys.push(key);
    }
    return { keys, size };
  },
  // The viewable copy of a file, appended block by block natively: no base64 round trip.
  async assemble(keys, target) {
    const p = target.startsWith('file://') ? decodeURI(target.slice('file://'.length)) : target;
    const dir = p.slice(0, p.lastIndexOf('/'));
    if (!(await FileSystem.exists(dir))) await FileSystem.mkdir(dir);
    const tmp = `${p}.part`;
    await FileSystem.writeFile(tmp, '', 'utf8');
    try {
      for (const key of keys) await FileSystem.concatFiles(pathOf(key), tmp);
      if (await FileSystem.exists(p)) await FileSystem.unlink(p);
      await FileSystem.mv(tmp, p);
    } catch (err) {
      await FileSystem.unlink(tmp).catch(() => {});
      throw err;
    }
  },
};
