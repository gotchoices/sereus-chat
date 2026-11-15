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
};
