/**
 * What the file layer needs from its host: somewhere to keep blocks, and a libp2p node per scope
 * (a strand's node) to serve and fetch over. Both are minimal shapes, so the module depends on no
 * particular storage library or libp2p version.
 */

/**
 * A device's block storage: opaque byte values under string keys. Keys are CIDs (`b…`) for
 * blocks, plus the module's own bookkeeping under keys starting with `_`. Values are whole
 * blocks (a chunk is at most a few hundred KiB), so no streaming is needed here.
 */
export interface BlockStore {
  get(key: string): Promise<Uint8Array | null>;
  put(key: string, bytes: Uint8Array): Promise<void>;
  has(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
  keys(): Promise<string[]>;
}

/** A chunk of a libp2p stream: bytes, or a list of byte arrays (libp2p 3's Uint8ArrayList). */
export type StreamChunk = Uint8Array | { subarray(): Uint8Array };

/** The parts of a libp2p 3 stream the exchange uses. */
export interface StreamLike extends AsyncIterable<StreamChunk> {
  send(data: Uint8Array): boolean;
  onDrain(options?: { signal?: AbortSignal }): Promise<void>;
  close(): Promise<void>;
  abort(err: Error): void;
}

export interface PeerIdLike { toString(): string }

/** The parts of a libp2p 3 node the exchange uses. */
export interface Libp2pLike {
  handle(protocol: string, handler: (stream: StreamLike, connection: { remotePeer: PeerIdLike }) => void | Promise<void>,
    options?: { runOnLimitedConnection?: boolean; maxInboundStreams?: number }): Promise<void>;
  unhandle?(protocol: string): Promise<void>;
  dialProtocol(peer: PeerIdLike, protocol: string, options?: { signal?: AbortSignal; runOnLimitedConnection?: boolean }): Promise<StreamLike>;
  getConnections(): Array<{ remotePeer: PeerIdLike; remoteAddr: { toString(): string } }>;
}

/** Block storage in memory, for tests and for hosts with nothing better. */
export class MemoryBlockStore implements BlockStore {
  private readonly map = new Map<string, Uint8Array>();
  async get(key: string) { return this.map.get(key) ?? null; }
  async put(key: string, bytes: Uint8Array) { this.map.set(key, bytes.slice()); }
  async has(key: string) { return this.map.has(key); }
  async delete(key: string) { this.map.delete(key); }
  async keys() { return [...this.map.keys()]; }
}
