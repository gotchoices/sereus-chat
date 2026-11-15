/**
 * The strand file layer (gotchoices/sereus#62): files for a strand's members, exchanged outside
 * the transaction path. Self-contained, so it can become its own package: it imports nothing
 * from chat and nothing from the stack, only `@noble/hashes` (a fallback hash).
 */
export { StrandFiles, NotAvailableError, FILES_PROTOCOL, DEFAULT_CHUNK_SIZE, DEFAULT_LEASE_MS } from './strand-files.js';
export type { Manifest, FetchReport, StrandFilesOptions, FileStatus } from './strand-files.js';
export { MemoryBlockStore } from './types.js';
export type { BlockStore, Libp2pLike, StreamLike, PeerIdLike, StreamChunk } from './types.js';
export { cidFor, parseCid, isCid, RAW, JSON_CODEC } from './cid.js';
