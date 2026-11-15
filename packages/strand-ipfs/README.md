# @chat/strand-ipfs

IPFS on a Sereus strand: an IPFS node that lives on a strand's own libp2p node and finds content
through the strand's FRET ring. It's built to move into the sereus stack, beside Optimystic, as
discussed in [gotchoices/sereus#62](https://github.com/gotchoices/sereus/issues/62).

## What it is

- **Helia's pieces, not Helia's node.** The exchange is [`@helia/bitswap`](https://github.com/ipfs/helia/tree/main/packages/bitswap)
  and files are [`@helia/unixfs`](https://github.com/ipfs/helia/tree/main/packages/unixfs). The
  `helia` package itself isn't used, because importing it brings its default libp2p stack: a
  Kademlia DHT, auto-TLS, a keychain, and a second `@libp2p/crypto`. A phone must not carry
  those. Bitswap attaches to any object that has Helia's mixin and block-broker hooks, and
  `StrandIpfs` provides them.
- **On a node it didn't make.** The strand's node is cadre's: `StrandIpfs` uses it but never
  starts or stops it. A wake gives a strand a new node, so make a new `StrandIpfs` on it, over the
  same block store.
- **A networked block store.** UnixFS, or anything written against `interface-blockstore`,
  reads through it. A block that isn't here is asked of the network (Bitswap), checked against
  its CID, kept, and returned.
- **Content routing on FRET** (`FretContentRouter`):
  - A CID's ring position is FRET's `hashKey` of its multihash.
  - The cohort nearest that position (`assembleCohort`, the rule Optimystic uses to place
    blocks) keeps provider records: who holds the CID.
  - `provide` hands a record to each cohort member; `findProviders` asks them.
  - Records travel on `/sereus/ipfs/providers/1.0.0`. FRET's activity handler is single, and
    Optimystic already uses it.
- **Gates for sereus to fill:**
  - `authorize(peer)` puts every protocol Bitswap and the router serve behind the strand's
    membership check.
  - `servable(cid)` serves only the strand's own blocks (a device's block store is shared by
    all its strands).
- **Host storage:** `KvBlockstore` turns a host's simple byte store (bytes under string keys,
  which is what a phone's file library or Node's file system supplies) into a standard IPFS block
  store.

## Tests

- IPFS's own block-store compliance suite (`interface-blockstore-tests`) runs against
  `KvBlockstore`. Its `aegir/chai` import is served by a vitest alias, so aegir isn't needed.
- Bitswap between two nodes that didn't make their libp2p.
- The membership gate.
- Content routing in a five-node FRET ring.

On a Galaxy S21 (Hermes), Bitswap and UnixFS bundle and run. They add 0.95 MB to the APK.

## Not done

- **A cadre hook for `authorize`.** Sereus today checks membership only on Optimystic's
  protocols on a strand node.
- **Re-providing on a schedule.** Records expire after 24 h; the blob layer provides on put and
  on fetch.
- **Rings much larger than a node's table.** The cohort is the nearest members a node knows
  (as Optimystic's), so very large rings should use FRET's lookup first.
- **Directories:** see MFS, the next layer.
