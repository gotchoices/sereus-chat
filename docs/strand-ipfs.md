# IPFS on a strand: second pass

Branch `strand-ipfs` (from `strand-files`), 2026-11-15. This builds the layering agreed with Nate
for [gotchoices/sereus#62](https://github.com/gotchoices/sereus/issues/62): an IPFS layer on FRET,
beside Optimystic; a blob layer that ties IPFS content to records; and, later, a hierarchical
file system for the strand drive.

## Layers

| Package | What it is | Used by |
|---|---|---|
| `packages/strand-ipfs` | IPFS on a strand's libp2p node: Helia's Bitswap and UnixFS without Helia's own libp2p bundle; content routing on FRET; a membership gate; host byte stores as IPFS block stores | everything below |
| `packages/strand-blobs` | Files a record refers to: put, fetch and read by CID; scope per strand; announcements; placement and the outbox; leases and gc; native joins | chat attachments |
| `packages/strand-drive` | A shared drive as rows in the strand's database (`DriveFolder`, `DriveFile`, prefix chosen by the app), each file naming a blob; folder rules, expiry ([SPEC.md](../packages/strand-drive/SPEC.md)) | chat's Drive screen and `serchat drive` (story 23) |

In chat, `packages/core/src/sereus/strand-media.ts` runs one IPFS node per strand node (remade on
a wake) and one blob layer per device. An attachment's ref is `ipfs:<CID>`, a UnixFS root.

The details are in each package's README.

## Why not Helia's node, and not kubo

Helia is TypeScript, and its pieces are modular. The `helia` package, though, imports its whole
default libp2p setup as soon as it is imported. Using Bitswap and UnixFS directly avoids that, at
about 1 MB of bundle on the phone. Kubo (Go) appears only in Helia's interop tests. We don't use
it: talking to the public IPFS network isn't a goal for strand-scoped files.

## Results

| | Prototype (`strand-files`) | IPFS layers |
|---|---|---|
| Core, 2.3 MB: send / local at the other party | 107–150 ms / 400 ms | 230 ms / 500 ms |
| Core, both asleep and woken together | 0.7 s | 0.73 s |
| Core, a cadre member: message while Alice away / photo after she returns | 0.45 s / 0.70 s | 0.54 s / 0.56 s |
| serchat, 14 MB in three files: send / 12 MB fetch | 3.2 s / 240 ms | 3.8 s / 633 ms |
| S21 ↔ serchat: serchat's photo on the phone; the phone's at serchat | 3.4 s / about 1 s | announced, fetched, placed; the phone's 1.68 MB put in 0.8 s, fetched in 1.8 s |
| S7 → S21, 1 MB: the S7's put / whole send / the S21's fetch | 0.47 s / 1.5 s / 6.6 s | 0.66 s / 1.65 s / 5.6–8.1 s |

On the S21 against serchat (`test/gui/phone-wakes.mjs`, PASS):
- **The phone asleep while serchat sends:** when the phone woke, serchat offered the file again,
  and the phone fetched it.
- **The phone sends, then leaves at once:** serchat had it 0.5 s later.
- **Both away, then back together:** the phone imported its photo natively (1 MB in 25 ms), and
  the announcement reached nobody. When both came back, the phone's outbox offered it, serchat
  fetched it in 1.4 s, and it was placed 7.1 s after the return.

Unit tests:
- strand-ipfs: 21, including IPFS's own block-store compliance suite (18 of them);
- strand-blobs: 9 (transfer, scope, announcements, a resumed fetch, outbox, both away with a
  restart, gc, native join, native import giving the importer's CIDs);
- strand-drive: 1;
- core: 90.

On the phone, two things kept a file's bytes out of JavaScript where they needn't be there:
- **Native hashing.** multiformats' sha256 becomes pure JavaScript on a phone; strand-ipfs
  hashes with `crypto.subtle`.
- **Native import.** The phone cuts a file into raw leaves itself, and the layer builds the same
  file node the UnixFS importer would. The S7's 1 MB put went from 3.3 s to 0.66 s, with the
  same CID.

Borrowed test suites: IPFS's `interface-blockstore-tests` run as they are (aegir's `expect`
replaced by chai with the same plugins). Helia's interop specs compare Helia against kubo (Go)
for the same CIDs and exchange. Without kubo, their scenarios (a large file each way over
Bitswap) are covered by our tests, with our node on both ends.

## Open

- **A cadre hook for the membership check.** These protocols need the check that sereus applies
  only to Optimystic's protocols today.
- **The drive's rules are kept by each app on its own writes.** A modified client could write
  rows the rules forbid; signed writes (Quereus mutation context) are the hardening path.
- **Expired drive rows stay** (hidden from listings) until a member removes them; nothing runs
  `removeExpired` yet.
- **Serving from a slow phone:** the S7 reads each block into JavaScript for libp2p, which takes
  5–8 s per MB.
- **Placement on storage nodes (Arachnode); quotas; partial reads.**
