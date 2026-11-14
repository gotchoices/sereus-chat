# Blobs: file bytes in a strand

Status: core and serchat built, 2026-11-13. Step 1 of "Next directions" in `STATUS.md`. Native
support requested upstream as gotchoices/quereus#40 (use case, this workaround, measurements, ideas).

Chat's attachments (stories 20 and 21), and later a per-strand shared drive, need a file's
**bytes** to reach the other members. Today nothing carries them: an `Attachment` row holds
metadata and the sender's local path. The stack has no large-object facility yet; Nate plans
native blob support in Quereus. Until then chat stores blobs itself, behind an interface that a
native implementation can replace.

## Limits we design around

| Limit | Value | Source |
|---|---|---|
| One transaction | 7.5 MiB encoded (`MAX_TRANSACTION_BYTES`) | optimystic `db-core/src/network/transaction-size.ts` |
| One block | 7.5 MiB; target 1 MiB, and an entry over 1 MiB gets a block to itself | `db-core/src/network/block-size.ts` |
| Blob encoding | base64 inside JSON, about +33% | optimystic `docs/internals.md` |

So a file is split into chunks that sit comfortably inside a block, and written a few chunks per
transaction.

## The interface (what chat codes against)

```ts
/** An opaque, self-describing reference: the scheme says which store wrote it. */
type BlobRef = string;                 // 'chunks:1:<sha256 of the whole content>'

interface BlobStore {
  /** Store bytes read from `source` in order; resolves to its ref once every part is written. */
  put(source: AsyncIterable<Uint8Array>, size: number): Promise<BlobRef>;
  /** Is it whole here, still arriving, or out of reach? Never throws for "not yet". */
  locality(ref: BlobRef): Promise<'local' | 'fetching' | 'unreachable'>;
  /** The bytes, in order. Waits for parts still arriving, up to a bound. */
  read(ref: BlobRef): AsyncIterable<Uint8Array>;
}
```

- **A ref names content, not a place.** It is the hash of the whole content, so two members
  attaching the same file make one blob, and a ref can be checked against what it reads.
- **The scheme prefix is the switch-over seam.** A native Quereus/Optimystic blob would get
  its own scheme (say `qblob:`). Readers dispatch on the prefix, so old messages keep reading
  through the chunk store while new ones use the native one. No data is migrated.
- **Hosts supply the file system**, keeping `@chat/core` platform-free. A `FileAccess` on
  `ChatHost` reads a picked file in pieces and writes a cache file (Node: `node:fs`; React
  Native: a file library; browser: `Blob`/OPFS).

## The chunk store (what we build now)

Two tables in `chat-sapp.qsql`, both content-keyed (Optimystic's `optimystic.content_key` tag:
two machines inserting the same content insert the same row, so a repeat is not a conflict):

```sql
table BlobChunk (
    Hash text primary key,     -- sha-256 of Bytes, hex
    Bytes blob not null
) with tags ("optimystic.content_key" = true, "optimystic.network_watch" = true);

table Blob (
    Id text primary key,       -- sha-256 of the whole content, hex
    Size integer not null,
    ChunkSize integer not null,
    Chunks text not null       -- JSON array of chunk hashes, in order
) with tags ("optimystic.content_key" = true, "optimystic.network_watch" = true);
```

`Attachment` gains `Blob text null` (the ref). `Attachment.Uri` stops carrying the sender's
local path: where a file is cached on a device is that device's business.

- **Write:** read the file in 256 KiB chunks, hashing as we go; insert chunks a few per
  transaction (8 chunks ≈ 2 MiB raw, ≈ 2.7 MiB encoded); then the `Blob` row; then the message
  and its `Attachment` rows. A member who sees the attachment before the last chunk reads
  "still arriving", never a broken file.
- **Read:** the `Blob` row lists the chunks; each is read by hash. All present: assemble into
  the device's cache and report `local`. Missing: `fetching`. Unreadable from anyone reachable:
  `unreachable`.
- **Integrity:** each chunk is checked against its hash, and the whole against the ref.
- **Size limit:** an outgoing ceiling as the user's own setting (story 20). Default 25 MB.
- **Deleting a message** removes its `Attachment` rows. Chunks stay while any `Blob` row uses
  them; collecting orphans is a later step (and a question for a native design).

What this will exercise in the stack, deliberately: transactions of a few MiB, many-block
replication through relays, the offline queue holding large writes, and backfill when a member
joins a strand that already holds files.

## For Nate: what SQLite and Fossil suggest for native blobs

A chunk table is an application doing by hand what an engine can do better. Two systems worth
borrowing from:

- **SQLite: overflow chains and incremental blob I/O.** SQLite stores a large value inline in its
  row, but spills what does not fit the page into a chain of overflow pages. The row holds the
  head; the value is still one column to SQL. Its incremental I/O API (`sqlite3_blob_open`,
  `sqlite3_blob_read`/`write` at an offset, `zeroblob(N)` to reserve space) reads or writes a
  range without loading the whole value. For Optimystic, the analogue is a large value stored as
  content-addressed chunk blocks with the row holding a small handle (hash, size, chunk list or
  tree root), plus a streaming read/write surface in Quereus. SQLite's own study ("Internal
  Versus External BLOBs") found values under about 100 KB are faster inline, larger ones
  outside the row: a size threshold for inline versus chunked fits here too.
- **Fossil (built on SQLite): content-addressed artifacts and "phantoms".** Fossil stores every
  artifact as a blob keyed by its hash, and syncs between peers by exchanging hashes and then
  the blobs missing on each side. A blob referenced but not yet received is a *phantom*: a
  known hash with no content yet. That is exactly the "still arriving" state chat needs, and a
  model for replicating rows eagerly while fetching large content lazily, on demand, from
  whoever holds it.

Together they suggest a native design:
- a blob column whose value is a handle;
- content in hash-addressed chunk blocks that dedupe across rows and strands;
- streaming reads and writes, with a "known but not here yet" state that reads can report;
- an inline threshold for small values;
- transactions that carry handles, not bytes, which sidesteps the 7.5 MiB limit without
  framing every hop.

Chat's chunk store is a working prototype of that shape, with measurements to share.
