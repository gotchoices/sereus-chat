# @chat/strand-drive

> **Being replaced.** This package is the first attempt, on MFS (one root per tree,
> last-writer-wins). The drive is being rebuilt as rows in the strand's database on top of
> `@chat/strand-blobs`, so concurrent edits merge row by row: see [SPEC.md](SPEC.md). The MFS
> version below stays until that lands.

A strand's shared drive: a directory tree on IPFS-on-a-strand, edited with MFS
([`@helia/mfs`](https://github.com/ipfs/helia/tree/main/packages/mfs)), with its root kept where
every member sees it: a strand record, which the app supplies as a `DriveRoot`. Built to move into
the sereus stack ([gotchoices/sereus#62](https://github.com/gotchoices/sereus/issues/62)).

## How it works

- **The root comes from the strand.** MFS keeps its root under one datastore key and caches it.
  Here that key reads and writes the strand's record, and every operation uses a fresh MFS, so
  it starts from the root the strand has now, including one another member wrote.
- **Kept and served through the blob layer.** After a change, the blob layer adopts the new root
  (`StrandBlobs.adopt`): it is served in the strand, kept from gc, and provided on FRET. The old
  root is released; blocks the new tree still uses stay.
- **Fetched on demand.** Members read what they open (`ls`, `cat`) over the strand. Nobody is
  sent the whole tree.

## Open: concurrent edits

The root is last-writer-wins. When two members change the drive at the same time, only the later
tree survives. `DriveRoot.save` is told the root the change started from, so a compare-and-set
(retry on conflict), or a three-way merge of the trees, can be added there. That design question
is for #62.

## Tests

Two members over libp2p on loopback, with the strand record simulated by one shared value:
- A builds a tree; B lists it and reads a 2.5 MB file over the network;
- B adds a file, and A sees both;
- A's gc keeps the live tree.
