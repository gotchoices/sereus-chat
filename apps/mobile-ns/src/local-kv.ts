/**
 * The node-local key-value records and the peer key, in optimystic's `kv` table, written
 * with `INSERT OR REPLACE` instead of `@optimystic/db-p2p-storage-ns`'s UPSERT
 * (`ON CONFLICT … DO UPDATE`), which needs SQLite 3.24 (Android 11's). The S7 (Android 8)
 * has 3.19 and rejects it. Not reported upstream: an old-phone accommodation, kept here.
 *
 * A row holds text (`s_val`, these records) or bytes (`b_val`, the key), never both, so
 * replacing the whole row loses nothing.
 */
import { generateKeyPair, privateKeyFromProtobuf, privateKeyToProtobuf } from '@libp2p/crypto/keys';
import type { PrivateKey } from '@libp2p/interface';
import type { IKVStore } from '@optimystic/db-p2p';
import type { OptimysticNSDBHandle } from '@optimystic/db-p2p-storage-ns';

export class LocalKVStore implements IKVStore {
  private readonly stmts;

  constructor(db: OptimysticNSDBHandle) {
    this.stmts = {
      get: db.prepare('SELECT s_val FROM kv WHERE key = ?'),
      set: db.prepare('INSERT OR REPLACE INTO kv (key, s_val, b_val) VALUES (?, ?, NULL)'),
      delete: db.prepare('DELETE FROM kv WHERE key = ?'),
      list: db.prepare('SELECT key FROM kv WHERE key >= ? AND key < ? ORDER BY key ASC'),
    };
  }

  async get(key: string): Promise<string | undefined> {
    const row = await this.stmts.get.get(key);
    return typeof row?.s_val === 'string' ? row.s_val : undefined;
  }

  async set(key: string, value: string): Promise<void> {
    await this.stmts.set.run(key, value);
  }

  async delete(key: string): Promise<void> {
    await this.stmts.delete.run(key);
  }

  async list(prefix: string): Promise<string[]> {
    const rows = await this.stmts.list.all(prefix, prefix + '\u{10FFFF}');
    return rows.map(row => row.key as string);
  }
}

const PEER_KEY = 'peer-private-key';

/** The node's libp2p key: loaded, or made once and kept (as `loadOrCreateNSPeerKey`). */
export async function loadOrCreatePeerKey(db: OptimysticNSDBHandle): Promise<PrivateKey> {
  const row = await db.prepare('SELECT b_val FROM kv WHERE key = ?').get(PEER_KEY);
  if (row?.b_val instanceof Uint8Array && row.b_val.length > 0) return privateKeyFromProtobuf(row.b_val);
  const key = await generateKeyPair('Ed25519');
  await db.prepare('INSERT OR REPLACE INTO kv (key, s_val, b_val) VALUES (?, NULL, ?)').run(PEER_KEY, privateKeyToProtobuf(key));
  return key;
}
