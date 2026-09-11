/**
 * A `LevelDBLike` driver over `classic-level` — the Node-native LevelDB binding.
 *
 * `@optimystic/db-p2p-storage-rn`'s storage classes depend only on the
 * `LevelDBLike` interface, never on `rn-leveldb` directly (which is why that is a
 * PEER dependency).  So the same adapter the phone runs can be driven from Node
 * by supplying this instead of the native module.
 *
 * Deliberately mirrors the shape of that package's own
 * `test/classic-level-driver.ts` so behaviour differences here cannot be mistaken
 * for the defect under test.  File-backed, not in-memory: the point is to put a
 * REAL on-disk LevelDB under the adapter.
 */
import { ClassicLevel } from 'classic-level';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class ClassicLevelAdapter {
  /**
   * `opDelayMs` sleeps before EVERY raw-storage operation, mirroring the
   * integration harness's own `storageOpDelayMs`. It stands in for the per-op
   * cost React Native pays crossing the JNI bridge to `rn-leveldb`, which is the
   * variable we are trying to separate from "Hermes vs V8".
   */
  constructor(db, opDelayMs = 0) { this.db = db; this.opDelayMs = opDelayMs; }

  async #pause() { if (this.opDelayMs > 0) await sleep(this.opDelayMs); }

  async get(key) {
    await this.#pause();
    const value = await this.db.get(key);
    return value === undefined ? undefined : new Uint8Array(value);
  }
  async put(key, value) { await this.#pause(); await this.db.put(key, value); }
  async delete(key) { await this.#pause(); await this.db.del(key); }

  batch() {
    const chain = this.db.batch();
    return {
      put(key, value) { chain.put(key, value); return this; },
      delete(key) { chain.del(key); return this; },
      write: async () => { await this.#pause(); await chain.write(); },
    };
  }

  iterator(options = {}) {
    const iter = this.db.iterator({ ...options, keyEncoding: 'view', valueEncoding: 'view' });
    return {
      next: async () => {
        await this.#pause();
        const entry = await iter.next();
        if (entry === undefined) return undefined;
        const [k, v] = entry;
        return [new Uint8Array(k), new Uint8Array(v ?? new Uint8Array())];
      },
      async close() { await iter.close(); },
    };
  }

  async close() { await this.db.close(); }
}

/** One isolated, file-backed database in a fresh temp directory. */
export function openTestDb(name = 'stack-check', opDelayMs = 0) {
  const dir = mkdtempSync(join(tmpdir(), `${name}-`));
  const db = new ClassicLevel(dir, { keyEncoding: 'view', valueEncoding: 'view' });
  return {
    db: new ClassicLevelAdapter(db, opDelayMs),
    dir,
    async cleanup() {
      try { await db.close(); } catch { /* already closed */ }
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
