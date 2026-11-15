/**
 * Block storage for the strand file layer (`@chat/core/files`, gotchoices/sereus#62) on Node:
 * one file per block in a directory of the profile, named by its key (a base32 CID, or the
 * layer's own `_index`). Writes go through a temporary file, so a reader never sees half a block.
 */
import { appendFile, mkdir, open, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname } from 'node:path';
import { join } from 'node:path';
import type { BlockStore } from '@chat/core/files';

const safe = (key: string) => {
  if (!/^[A-Za-z0-9_]+$/.test(key)) throw new Error(`not a block key: ${key}`);
  return key;
};

export function nodeBlockStore(dir: string): BlockStore {
  let made: Promise<unknown> | null = null;
  const ready = () => (made ??= mkdir(dir, { recursive: true }));
  return {
    async get(key) {
      try { return new Uint8Array(await readFile(join(dir, safe(key)))); } catch { return null; }
    },
    async put(key, bytes) {
      await ready();
      const path = join(dir, safe(key));
      const tmp = `${path}.part-${process.pid}-${Date.now()}`;
      await writeFile(tmp, bytes);
      await rename(tmp, path);
    },
    async has(key) {
      try { await stat(join(dir, safe(key))); return true; } catch { return false; }
    },
    async delete(key) {
      await rm(join(dir, safe(key)), { force: true });
    },
    async keys() {
      try { return (await readdir(dir)).filter(n => !n.includes('.part-')); } catch { return []; }
    },
    async importFile(path, chunkSize, name) {
      await ready();
      const fh = await open(path, 'r');
      const keys: string[] = [];
      let size = 0;
      try {
        for (;;) {
          const buf = new Uint8Array(chunkSize);
          let fill = 0;
          while (fill < chunkSize) {
            const { bytesRead } = await fh.read(buf, fill, chunkSize - fill, null);
            if (!bytesRead) break;
            fill += bytesRead;
          }
          if (!fill) break;
          const chunk = buf.subarray(0, fill);
          const key = name(createHash('sha256').update(chunk).digest('hex'));
          if (!(await this.has(key))) await this.put(key, chunk);
          keys.push(key);
          size += fill;
          if (fill < chunkSize) break;
        }
      } finally {
        await fh.close();
      }
      return { keys, size };
    },
    async assemble(keys, path) {
      await mkdir(dirname(path), { recursive: true });
      const tmp = `${path}.part-${process.pid}-${Date.now()}`;
      try {
        await writeFile(tmp, new Uint8Array(0));
        for (const key of keys) await appendFile(tmp, await readFile(join(dir, safe(key))));
        await rename(tmp, path);
      } catch (err) {
        await rm(tmp, { force: true });
        throw err;
      }
    },
  };
}
