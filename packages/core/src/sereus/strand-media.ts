/**
 * strand-media.ts — chat's files on IPFS-on-a-strand (`@chat/strand-ipfs`, `@chat/strand-blobs`;
 * gotchoices/sereus#62). One `StrandIpfs` per strand node, with content routing on the node's
 * FRET; one `StrandBlobs` for the device, over the host's block storage. A wake gives a strand
 * a new node: the old IPFS node is stopped and a new one made on it (the blobs layer then offers
 * what nobody else holds yet). A strand going down stops its IPFS node.
 *
 * Attachments name their file `ipfs:<CID>` (a UnixFS root).
 */
import { StrandIpfs, FretContentRouter, KvBlockstore, type FretLike } from '@chat/strand-ipfs';
import { StrandBlobs } from '@chat/strand-blobs';
import { hashKey } from 'p2p-fret';
import type { StrandInstance } from '@serfab/cadre-core';
import type { Libp2p } from '@libp2p/interface';
import type { BlockStore } from '../files/index.js';

export const IPFS_REF = 'ipfs:';

interface Running { libp2p: Libp2p; ipfs: StrandIpfs; router: FretContentRouter | null }

export class StrandMedia {
  readonly blobs: StrandBlobs;
  private readonly blockstore: KvBlockstore;
  private readonly running = new Map<string, Running>();
  private readonly pending = new Map<string, Promise<StrandIpfs | undefined>>();
  private readonly log: (line: string) => void;

  constructor(blocks: BlockStore, opts: { maxAnnouncedBytes: () => number; log: (line: string) => void }) {
    this.log = opts.log;
    this.blockstore = new KvBlockstore(blocks);
    const assemble = blocks.assemble?.bind(blocks);
    const importFile = blocks.importFile?.bind(blocks);
    this.blobs = new StrandBlobs({
      blockstore: this.blockstore,
      index: blocks,
      log: opts.log,
      // A member announced a new file: fetch it now, up to the attachment limit, so it is here
      // before anyone opens the conversation.
      onAnnounce: () => opts.maxAnnouncedBytes(),
      ...(assemble ? { assemble } : {}),
      // A phone cuts a file into blocks natively; the CID is the one UnixFS would give.
      ...(importFile ? { importFile } : {}),
    });
  }

  /** The strand's IPFS node, on its current libp2p node (made, or remade after a wake). */
  ensure(strandId: string, strand: StrandInstance | undefined): Promise<StrandIpfs | undefined> {
    const libp2p = strand?.libp2pNode as unknown as Libp2p | undefined;
    if (!libp2p) return Promise.resolve(undefined);
    const current = this.running.get(strandId);
    if (current?.libp2p === libp2p) return Promise.resolve(current.ipfs);
    let p = this.pending.get(strandId);
    if (!p) {
      p = this.start(strandId, libp2p).finally(() => this.pending.delete(strandId));
      this.pending.set(strandId, p);
    }
    return p;
  }

  private async start(strandId: string, libp2p: Libp2p): Promise<StrandIpfs | undefined> {
    await this.stop(strandId);
    const fret = (libp2p as unknown as { services?: { fret?: FretLike } }).services?.fret;
    const router = fret ? new FretContentRouter({ libp2p, fret, hashKey }) : null;
    // NOTE: no `authorize` yet. Sereus checks membership only on Optimystic's protocols on a
    // strand node; these need the same check (a cadre hook, asked of sereus). Until then a
    // strand's files are served to whoever reaches its node and knows a CID.
    const ipfs = new StrandIpfs({
      libp2p,
      blockstore: this.blockstore,
      routers: router ? [router] : [],
      servable: cid => this.blobs.servable(strandId, cid),
    });
    await router?.start();
    await ipfs.start();
    this.running.set(strandId, { libp2p, ipfs, router });
    await this.blobs.attach(strandId, ipfs);
    this.log(`[media] IPFS on strand ${strandId.slice(0, 8)}${router ? ' (routing on FRET)' : ''}`);
    return ipfs;
  }

  /** The strand's node is going away. */
  async stop(strandId: string): Promise<void> {
    const r = this.running.get(strandId);
    if (!r) return;
    this.running.delete(strandId);
    this.blobs.detach(strandId, r.ipfs);
    await r.ipfs.stop().catch(() => {});
    await r.router?.stop().catch(() => {});
  }
}
