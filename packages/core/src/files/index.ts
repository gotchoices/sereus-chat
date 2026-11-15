/**
 * What a host supplies for chat's files (IPFS-on-a-strand, `@chat/strand-ipfs` and
 * `@chat/strand-blobs`; gotchoices/sereus#62): its block storage, as bytes under string keys
 * (CIDs, and the layers' own bookkeeping under `_` keys), with optional native shortcuts.
 */
export interface BlockStore {
  get(key: string): Promise<Uint8Array | null>;
  put(key: string, bytes: Uint8Array): Promise<void>;
  has(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
  keys(): Promise<string[]>;
  /**
   * Optional: write these blocks, in order, as one file at `path`, without passing the bytes
   * through JavaScript (a phone's file appends). A file made of raw leaves is joined this way.
   */
  assemble?(keys: string[], path: string): Promise<void>;
  /** Optional, unused for now: cut a file into blocks natively (see the strand-files branch). */
  importFile?(path: string, chunkSize: number, name: (sha256Hex: string) => string): Promise<{ keys: string[]; size: number }>;
}

/** Block storage in memory, for tests. */
export class MemoryBlockStore implements BlockStore {
  private readonly map = new Map<string, Uint8Array>();
  async get(key: string) { return this.map.get(key) ?? null; }
  async put(key: string, bytes: Uint8Array) { this.map.set(key, bytes.slice()); }
  async has(key: string) { return this.map.has(key); }
  async delete(key: string) { this.map.delete(key); }
  async keys() { return [...this.map.keys()]; }
}
