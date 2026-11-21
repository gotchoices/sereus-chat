# Our strand file layer against Optimystic 1.29's native blobs

Branch `blobs-eval`, 2026-11-21. The stack is sereus 1.23.0 on Optimystic 1.29.0 and Quereus
5.6.1. Sereus 1.23's version ranges admit both, and the core suite passes on it. Chat's
attachments move through one of two engines (`ChatHost.blobEngine`):

- **ours:** the strand file layer, `ipfs:<CID>`;
- **optimystic:** the strand node's own `node.blobs`, `ob:<ref>`.

Everything else is the same build. Both engines run on the same stack, against the same serchat,
through the public relay. Times come from the phone's own `[perf]` lines, measured from when the
message was sent, with Maestro kept out of the window (`HOLD_MS`).

How to repeat it:

- Node: `BLOB_ENGINE=ours|optimystic npx vitest run src/sereus/file-layer.test.ts`.
- Phones: `BLOB_ENGINE=… FILE=… PHONE_FILE=1 HOLD_MS=45000 PHONE_LOG=… SERCHAT_LOG=…
  node test/gui/phone-joins-serchat.mjs <device>`, with `BLOB_ENGINE` set the same in
  `apps/mobile/src/data/config.ts`.

## Results

Node, in process, loopback, 2.3 MB, three runs each:

| | ours | optimystic |
|---|---|---|
| send | 193–205 ms | 129–132 ms |
| whole at the other member | 460–474 ms | 395–400 ms |
| a receiver asleep while the file was sent, then woken | passes | passes |

S21, 1.68 MB photo, through the relay, three runs each:

| | ours | optimystic |
|---|---|---|
| phone stores the photo to send | **47–54 ms** (native import) | 356–438 ms |
| S21 → serchat, whole at serchat | 1.6–1.9 s | 1.5–2.7 s |
| serchat → S21, whole on the phone | **2.5–3.8 s** | 3.7–4.6 s, of which writing the viewable copy took 0.6 s |

S7, 1 MB photo from the phone and 1.68 MB from serchat, cleared before each run (one strand):

| | ours | optimystic |
|---|---|---|
| phone stores the photo to send | **0.18–0.57 s** (native import) | 1.1–1.4 s |
| S7 → serchat, whole at serchat | 7.1–8.8 s (serchat's fetch from the S7: 5.6–8.4 s) | **6.6–6.9 s** (fetch 2.7–2.9 s) |
| serchat → S7, whole on the phone | 9.7–13.0 s | 9.0–11.7 s, of which writing the viewable copy took **2.7–3.4 s** |

With 11–16 strands on the S7 (not cleared), every figure grew. Optimystic's put took 7.2–7.7 s in
one state and ours 18.3 s in a busier one. The phone's load decides those numbers, not the engine.

## What the numbers say

- **Neither engine clearly wins end to end.** On the S21 ours is somewhat faster in one direction
  and even in the other. On the S7 the two are within each other's spread.
- **Ours stores a photo 3–7× faster** (native import: hashing and chunking in the file library,
  with no bytes through JavaScript).
- **Optimystic serves from the S7 2–3× faster.** But its pieces were in memory: sereus passes no
  piece store, so the node uses `MemoryPieceStore`. Ours read from block files. The persistent
  phone store (`LevelDBPieceStore`) is "not yet run on a device", and its cost is the open
  question.
- **Optimystic's receive pays 2.7–3.4 s on the S7 to write the viewable copy.** That is chat's
  side: the pieces go through JavaScript to the file library as base64. Ours joins block files
  natively (`assemble`). A piece store over files, with a native "export to path", would close it.
- **The relay is not a problem with our relay.** Optimystic's doc warns that a stock relay (128 KiB)
  cannot carry a piece. relay.sereus.org carried every transfer.

## Optimystic's full path: a `blobref` column (added the same day)

Chat's schema (sApp 0.6.0, this branch only) gains `Attachment.BlobRef blobref null`, written
with the bare reference whenever the bytes went through `node.blobs`. Getting the type into a
strand database took a local patch to sereus (`.yarn/patches`, below).

- **It works.** The commit pins and announces the blob, B pulls it without anyone reading it, and A
  hears durability go `local 1/2`, then `full 2/2` (`src/sereus/blobref.test.ts`).
- **The cohort's own pull waits for the copy drain:** B held the bytes 6.4 s after the send, three
  runs alike. That is the drain's 5 s debounce (`DEFAULT_BLOB_COPY_DRAIN_CONFIG`, shared with the
  block drain), not transfer time. A reader that fetches when the message is listed, as chat
  does, has the bytes in about 0.4 s. So the column buys durability and lifetime, and the read
  keeps it fast.
- **On the phones it adds nothing to the times:** S21 1.5–1.6 s out and 4.6–4.7 s in, S7 6.8–7.5 s
  out and 10.2–11.1 s in, cleared before each run.

## Sleep and wake (`test/gui/phone-wakes.mjs`, S21, cleared before each engine)

| case | ours | optimystic + blobref |
|---|---|---|
| 1. phone asleep while serchat sends; photo shown after it returns | 17.3 s (mostly Maestro's own time) | 16.4 s |
| 2. phone sends, then goes to the background | serchat had it in 0.5 s | 0.5 s |
| 3. both away: the phone's message and photo wait, then both return | **8.4 s, pass** | **fail: never** |

Case 3 fails because the pieces were in memory. Sereus passes the strand node no `pieceStorage`
or persistent `kvStore`, so Optimystic uses `MemoryPieceStore`. A strand that hibernates (the app
in the background) is rebuilt on waking, empty, and the sender no longer has the photo: serchat's
fetch answers `not-held` for good. The same in Node: after A's strand sleeps and wakes, A's
`stat` of the blob says `unknown`, and B never gets it (second test in `blobref.test.ts`). Ours
keeps blocks in files.

## Not yet compared

- A persistent piece store on a phone (sereus does not wire one), and with it the serving speed
  of the S7 from disk rather than memory.
- CPU while serving (the lag meter), memory with many photos, the drive on `blobref`.
- APK size: both builds contain both layers here.

## Sereus gaps found

1. **The `blobref` type is not registered in a strand database.** `applyRegistrations` in
   `quereus-plugin-sereus` (`compose-strand.js`) registers the plugin's vtables, functions and
   collations, but not `types`, which Optimystic 1.29 added. A schema declaring `blobref` is then
   refused. The fix is one loop, `db.registerType(type.name, type.definition)`; this branch
   carries it as a Yarn patch.
2. **No persistent `pieceStorage` or `kvStore` for blobs on strand nodes,** so blobs do not survive
   a hibernate and wake (or a restart). Phones need the LevelDB piece store, and with it a
   measurement of serving from storage.
3. **The copy drain's schedule** (`NodeOptions.blobs.copy`) is not exposed. Optional: the reader's
   fetch already covers chat's latency.

Standalone reproductions, sereus and Optimystic only, one node, no peers
(`test/stack/solo-node.mjs` builds the node and a strand of a one-table sApp):

- `node test/stack/blobref-type.mjs`, for gap 1. On stock sereus 1.23.0, founding the strand fails
  with `AppSchemaRefusedError: … Unknown type 'blobref' for column 'Content' of table 'App.Photo':
  register the type (Database.registerType) before using it`. With the one-loop patch it passes:
  a reference is stored and a non-reference is refused.
- `node test/stack/blob-survives-hibernate.mjs`, for gap 2. A 1 MB blob put on the strand node
  reads `here`; after `hibernateStrand` and `wakeStrand` it reads `unknown`, with 0 bytes held.

## What adoption would want (for Nate)

1. Sereus gaps 1 and 2 fixed. Without 2, a photo sent just before the phone sleeps is lost.
   Then a persistent piece store measured on a device, keeping the serving speed above.
2. A native path for phones: put from a file path and read to a file path without the bytes
   passing through JavaScript (a host-supplied piece store over files, or put and export hooks).
   On the S7 that is 1–3 s each way.
3. The three sleep-and-wake cases passing on phones, as ours does.

Going back: a phone that has run Optimystic 1.28 or later keeps commit proofs in a new form, and
an older build cannot read them, so returning these phones to the `strand-ipfs` build needs a
storage wipe.
