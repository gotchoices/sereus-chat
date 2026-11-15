# Strand files

A prototype of the strand-scoped file layer proposed in
[gotchoices/sereus#62](https://github.com/gotchoices/sereus/issues/62). It lives in chat's core
for now and is built to move into its own package: it imports nothing from chat and nothing from
the stack, only `@noble/hashes` as a fallback hash. A test enforces that.

## Why

Through the database, a 1 MB photo takes 57–149 s between a phone and a desktop over the public
relay. Plain bytes over the same connection take 0.4 s (chat's `bench.ts`). A file's bytes need no
consensus: each block is checked against its hash. So only a small handle goes in a database
record, and the bytes move here.

## Model

- **Blocks.** A file is cut into chunks (256 KiB). Each chunk is a block named by its CID: CIDv1,
  raw codec, sha2-256, base32. These are real IPFS CIDs, so a later move to Helia or UnixFS keeps
  the ids. A **manifest** block, JSON `{ v, size, chunkSize, chunks }` under its own CID (json
  codec), lists the chunks. The manifest's CID is the file's id.
- **Store.** A device keeps blocks in a `BlockStore` its host supplies: opaque bytes under string
  keys. The module keeps its index there too, under `_index`.
- **Exchange.** One protocol, `/sereus/strand-files/1.0.0`, on each strand's libp2p node:
  - the request is one frame, `u32 length` + JSON `{ "want": [cid, …] }` (at most 64 CIDs);
  - the answer, for each CID in order, is `u8 status` (1: have, 0: not here) + `u32 length` +
    the bytes.

  A fetch gets the manifest from whoever has it, then the missing chunks: several requests in
  flight (default 4 × 4 chunks), spread over the connected peers. Every block is checked against
  its CID. A "not here", or a failed request, sends those CIDs to the next peer. A peer that
  doesn't speak the protocol (the relay) is muted for a minute. A request stalled for 20 s is
  abandoned. A deadline that depends on progress, not on size.
- **Scope.** A file belongs to the strands it was put or fetched in. A peer asking over one
  strand's node gets only that strand's files, so knowing a CID doesn't let anyone read across
  strands. Only the strand's members can reach its node at all.
- **Spread.** Whoever fetches a file then serves it, so a file survives its sender going offline
  as soon as any other member has fetched it.
- **Lifetime.** Every file has a lease (default 30 days). Putting, fetching, `touch` or
  `reference` extends it, and `gc` deletes what has run out, plus blocks no live file uses. An
  app keeps a file for as long as a record points at it by calling `reference` when it reads that
  record. Every member holding the record does that, so the file stays wherever it is
  referenced, with no reference counting across machines.

## API

```ts
const files = new StrandFiles({ blocks, chunkSize?, leaseMs?, parallel?, perRequest?, log? });
await files.serve(strandId, libp2pNode);       // answer requests in that strand (again after a wake)
const { cid, size } = await files.put(strandId, bytes);   // stored here; nothing is sent
for await (const piece of files.read(strandId, cid)) …    // fetches what is missing first
await files.fetch(strandId, cid);              // throws NotAvailableError: retry later
await files.has(cid);  await files.manifest(cid);
await files.reference(strandId, cid);  await files.touch(cid, ms);  await files.gc();
```

## Not done (questions for #62)

- **Placement.** Today blocks live where they were put or fetched. Arachnode's rings would add
  storage nodes that hold a strand's files without anyone asking for them.
- **Push.** Nobody pushes a new file to the others. Readers fetch, and chat fetches eagerly when
  an attachment arrives.
- **Discovery.** Only directly connected peers are asked. Fine for a strand's members; a large
  strand would want its DHT.
- **Partial reads, resumable transfers, and quotas.**
