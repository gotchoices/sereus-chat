/**
 * `FileAccess` over Node's file system (docs/blobs.md), for serchat (the core's test hosts have their own,
 * `packages/core/src/testing/node-files.ts`): picked files are read in pieces, and a
 * blob's copy is kept in `cacheDir`, named by its ref so every member's copy of one blob has the
 * same name. Writes go through a temporary file, so a reader never sees a half-written copy.
 */
import { createReadStream } from 'node:fs';
import { mkdir, open, rename, rm, stat } from 'node:fs/promises';
import { extname, join } from 'node:path';
import type { FileAccess } from '@chat/core/sereus';

export function nodeFileAccess(cacheDir: string): FileAccess {
  return {
    async size(uri) { return (await stat(uri)).size; },
    async *read(uri, pieceSize) {
      for await (const piece of createReadStream(uri, { highWaterMark: pieceSize })) yield new Uint8Array(piece as Buffer);
    },
    cachePath(ref, name) {
      const id = ref.replace(/[^A-Za-z0-9]+/g, '-');
      const ext = name ? extname(name).replace(/[^A-Za-z0-9.]/g, '').slice(0, 10) : '';
      return join(cacheDir, `${id}${ext}`);
    },
    async exists(uri) { try { await stat(uri); return true; } catch { return false; } },
    async write(uri, pieces) {
      await mkdir(join(uri, '..'), { recursive: true });
      const tmp = `${uri}.part-${process.pid}-${Date.now()}`;
      const fh = await open(tmp, 'w');
      try {
        for await (const piece of pieces) await fh.write(piece);
        await fh.close();
        await rename(tmp, uri);
      } catch (err) {
        await fh.close().catch(() => {});
        await rm(tmp, { force: true });
        throw err;
      }
    },
  };
}
