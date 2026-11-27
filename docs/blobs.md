# Files in a strand

How chat's attachments (stories 20 and 21) and the drive's files (story 23) reach the other
members. Since 2026-11-23 (branch `sereus-blobs`), chat relies on the stack for this and keeps no
file transport of its own.

## How it works

- **The bytes:** the strand node's blob service, Optimystic 1.29's native blobs, which every
  strand node has under sereus 1.24. A file is cut into 256 KiB pieces in IPFS's formats and named
  by its CIDv1, the same CID `ipfs add --cid-version 1` gives. It is checked against that name
  wherever it is received, and pulled by whoever reads it. The design of record is Optimystic's
  `docs/blobs.md`.
- **The reference:** a `blobref` column. It is `App.Attachment.Blob` for attachments and
  `App.DriveFile.Blob` for the drive (`driveSchema`'s default `blobType`). A committed row that
  names a blob pins it on the writer, has the strand's cohort pull it (after the copy drain's 5 s
  debounce), and keeps it alive for as long as a row references it.
- **This device's copy:** every file a device has is also kept as a plain file at
  `FileAccess.cachePath(ref, name)`, so a screen shows it from a path. The sender writes its copy
  when it puts the file.

All of it is in one module, `packages/core/src/sereus/strand-files.ts` (`StrandFiles`):

| | |
|---|---|
| `put(strand, uri, name)` | the file's bytes into the blob service; this device's copy; the reference to write |
| `here(ref, name)` | this device's copy, if it has one |
| `bring(strand, ref, name)` | the copy, fetched first if needed, waiting up to 15 s for a member that holds it; else `unavailable` / `still-arriving` |
| `settled()` | resolves once every file put here is held by a majority of its strand: a short-lived host (serchat's one-shot runs) waits for it, bounded, before exiting |

The model uses it in `send` (attachments) and in `drive.addFile` and `drive.open`. When a message
lists, attachments whose files are not here yet are fetched in the background, so a file spreads
to the members who are online while its sender still is.

## Files persist (since sereus 1.25)

Until sereus 1.25 every copy of a file was in memory (gotchoices/sereus#67, gap 2): a file no one
else had fetched was lost when its sender's strand slept or its process ended. Since 1.25 each
strand node takes all of its storage from the host (`storage.open`: blocks, node-local records,
blob pieces), so a file outlives a sleep and a restart on the sender and on every member that
holds it.

What shows it:
- `test/cli/serchat-file-survives-restart.mjs`: A sends a photo while B is down and exits; A
  starts again as a new process, and B fetches the photo byte for byte;
- both cases of `src/sereus/file-transient.test.ts` (a sleep while no one else holds the file;
  an always-on member delivering it), which were marked `it.fails` until 1.25.

Still open upstream (sereus's backlog `feat-strand-blobs-persist`), and why sereus's own
`docs/schema-guide.md` still says not to declare `blobref` yet:
- **No `hold` choice.** A phone that is a strand's cohort member pulls other members' files as
  eagerly as an always-on machine does.
- **No app-facing blob service.** Chat reaches it through the strand node
  (`StrandFiles.blobsOf`, `strand.libp2pNode.blobs`), not a sereus API.

## Limits

- The largest file a device sends is the user's own setting (story 20; `ChatHost.maxAttachmentBytes`,
  default 25 MB), checked before any bytes move.
- A blob's pieces cross relays as libp2p streams. relay.sereus.org carries them; a relay with libp2p's
  stock limits (128 KiB a stream) would not (Optimystic `docs/blobs.md`, "Relays").

## History

- **Chunk rows (sApp 0.4.0):** files as rows of a `BlobChunk` table, a few chunks per
  transaction. They paid the per-byte cost of a transaction and could not be reclaimed.
- **Our own strand file layer (sApp 0.4.0–0.5.0):** IPFS on each strand's node (Helia's Bitswap and
  UnixFS, content routing on FRET; `packages/strand-ipfs`) and a blob layer with announcements,
  an outbox and leases (`packages/strand-blobs`). It is kept in git at tag
  `strand-files-ipfs-final`, with `docs/strand-files.md` and `docs/strand-ipfs.md` as they were.
- **The comparison that led to this:** branch `blobs-eval`, `docs/blobs-eval.md`. End to end the two
  were even on phones. Ours stored a photo 3–7× faster thanks to native import; Optimystic
  served from a slow phone faster, but from memory. Ours survived a phone's sleep and Optimystic's,
  under sereus, does not yet.
