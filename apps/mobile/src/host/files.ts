/**
 * `FileAccess` on the phone (docs/blobs.md), over react-native-file-access: a picked file is read
 * in pieces (`readFileChunk`), and a blob's copy is kept in the app's cache directory, named by
 * its ref so the same blob is one file. Copies are re-fetchable from the strand, so the cache is
 * the right place even though Android may clear it.
 *
 * The library speaks base64 strings across the bridge; `uint8arrays` converts. URIs given to the
 * app are `file://…` (what `Image` wants); the library takes plain paths.
 */
import { Dirs, FileSystem } from 'react-native-file-access';
import { fromString, toString } from 'uint8arrays';
import type { FileAccess } from '@chat/core/sereus';

const path = (uri: string) => (uri.startsWith('file://') ? decodeURI(uri.slice('file://'.length)) : uri);
const BLOB_DIR = `${Dirs.CacheDir}/blobs`;

export const phoneFiles: FileAccess = {
  async size(uri) {
    return (await FileSystem.stat(path(uri))).size;
  },
  async *read(uri, pieceSize) {
    const p = path(uri);
    const size = (await FileSystem.stat(p)).size;
    for (let at = 0; at < size; at += pieceSize) {
      const b64 = await FileSystem.readFileChunk(p, at, Math.min(pieceSize, size - at), 'base64');
      yield fromString(b64, 'base64pad');
    }
  },
  cachePath(ref, name) {
    const id = ref.replace(/[^A-Za-z0-9]+/g, '-');
    const ext = name && /\.[A-Za-z0-9]{1,10}$/.test(name) ? name.slice(name.lastIndexOf('.')) : '';
    return `file://${BLOB_DIR}/${id}${ext}`;
  },
  async exists(uri) {
    return FileSystem.exists(path(uri));
  },
  async write(uri, pieces) {
    const p = path(uri);
    if (!(await FileSystem.exists(BLOB_DIR))) await FileSystem.mkdir(BLOB_DIR);
    const tmp = `${p}.part`;
    if (await FileSystem.exists(tmp)) await FileSystem.unlink(tmp);
    let first = true;
    try {
      for await (const piece of pieces) {
        const b64 = toString(piece, 'base64pad');
        if (first) { await FileSystem.writeFile(tmp, b64, 'base64'); first = false; }
        else await FileSystem.appendFile(tmp, b64, 'base64');
      }
      if (first) await FileSystem.writeFile(tmp, '', 'utf8');   // an empty file
      if (await FileSystem.exists(p)) await FileSystem.unlink(p);
      await FileSystem.mv(tmp, p);
    } catch (err) {
      await FileSystem.unlink(tmp).catch(() => {});
      throw err;
    }
  },
};
