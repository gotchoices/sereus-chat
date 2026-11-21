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

## Not yet compared

- Optimystic's full path: a `blobref` column, pins that follow commits, the announce, and the
  cohort pulling the file without anyone reading it, which is their counterpart of our
  announce-and-prefetch. This branch only swaps the byte layer under a text column.
- A persistent piece store on a phone; sleep and wake on phones; the drive (still on ours); CPU
  while serving (the lag meter); memory with many photos held in a `MemoryPieceStore`.
- APK size: both builds contain both layers here.

## What adoption would want (for Nate)

1. A persistent piece store measured on a device, keeping the serving speed above.
2. A native path for phones: put from a file path and read to a file path without the bytes
   passing through JavaScript (a host-supplied piece store over files, or put and export hooks).
   On the S7 that is 1–3 s each way.
3. The `blobref` path tested on phones, including a receiver that was asleep.

Going back: a phone that has run Optimystic 1.28 or later keeps commit proofs in a new form, and
an older build cannot read them, so returning these phones to the `strand-ipfs` build needs a
storage wipe.
