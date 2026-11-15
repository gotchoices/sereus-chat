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
| (next) MFS | A directory tree (`@helia/mfs`) whose root is kept in a strand record | the strand drive |

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

Unit tests: strand-ipfs 21, including IPFS's own block-store compliance suite (18); strand-blobs
8 (transfer, scope, announcements, interrupted transfer, outbox, both away with a restart, gc,
native join); core 90.

## Open

- **A cadre hook for the membership check.** These protocols need the check that sereus applies
  only to Optimystic's protocols today.
- **Native import on the phone.** UnixFS import runs in JavaScript. The prototype's native chunk
  import doesn't apply as is, because a UnixFS root must be built to match.
- **MFS and the shared root for the strand drive.**
- **Placement on storage nodes (Arachnode); quotas; partial reads.**
