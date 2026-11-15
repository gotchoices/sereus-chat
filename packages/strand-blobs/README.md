# @chat/strand-blobs

Files that a strand's records refer to, on [`@chat/strand-ipfs`](../strand-ipfs). An app puts a
file and stores its CID in a record; members fetch it by CID. Chat's attachments use it. Built
to move into the sereus stack ([gotchoices/sereus#62](https://github.com/gotchoices/sereus/issues/62)).

## What it adds to a bare IPFS node

- **Files:** UnixFS with the current standard profile (`unixfs-v1-2025`: CIDv1, raw leaves,
  1 MiB chunks), so a file's id is an ordinary IPFS CID. A file's size is checked from its root
  before the rest is fetched.
- **Scope:** a file belongs to the strands it was put or fetched in. A strand's node serves
  only that strand's blocks (`servable`, which `StrandIpfs` asks).
- **Announcements:** after a put, the holder tells the strand's connected members. Each member's
  `onAnnounce` says whether to fetch now, and up to what size. They travel on
  `/sereus/blobs/announce/1.0.0`, behind the same membership gate.
- **Placement, the file layer's offline mode:**
  - A file records which members hold it: a member announces a file once it has fetched it.
  - A file put here that nobody else holds is in the outbox. It's offered again when a member
    connects, when the strand's node changes (a wake), and every minute, until someone holds
    it.
  - `status(cid).placed` says whether that has happened yet; `onPlaced` fires when it does.
- **Lifetime:**
  - Every file has a lease. Putting, fetching, `touch` and `reference` extend it.
  - `gc` removes files whose lease ran out, and any block that no live file uses.
  - An app keeps a file for as long as a record points at it by calling `reference` when it
    reads the record.
- **Routing:** each file's root is provided to the routers (FRET), so members who aren't
  connected to a holder can still find it.
- **Native joins:** a file made of raw leaves can be written out by a host that can join
  blocks natively (`assemble`). A phone does this with file appends, and the bytes never pass
  through JavaScript.

## Tests

Over real libp2p on loopback:
- an identical transfer;
- strands kept apart;
- announcements up to a size limit, and the sender seeing the file placed;
- an interrupted transfer that resumes and fetches only the rest;
- the outbox;
- both members away, then back together, with the sender's app restarted;
- garbage collection and an index that survives a restart;
- a native join.

Chat-level tests (`packages/core`) add: through a relay, both members asleep and woken together;
and a party with a cadre member (records from its replica, files from the members).

## Not done

- **Placement on storage nodes (Arachnode):** today a file lives where it was put or fetched.
- **Quotas.**
- **Partial reads.** UnixFS supports offsets; this layer doesn't expose them yet.
- **Directories:** a shared drive belongs on MFS, with the drive's root kept in a strand record.
