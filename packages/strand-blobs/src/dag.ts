/**
 * Walking a file's DAG (UnixFS: dag-pb nodes over raw leaves) through local blocks: every block
 * it is made of, in order, and whether its leaves are raw (then, in order, they are the file's
 * bytes, and a host can join them natively).
 */
import * as dagPb from '@ipld/dag-pb'
import { CID } from 'multiformats/cid'
import * as raw from 'multiformats/codecs/raw'

export interface DagShape {
  /** Every block, depth first, in file order. */
  blocks: CID[]
  /** The raw leaves in file order, or null when some leaf holds its bytes inside a dag-pb node. */
  rawLeaves: CID[] | null
}

/** The shape of the DAG under `root`, reading blocks with `get` (which throws for a missing one). */
export async function dagShape (root: CID, get: (cid: CID) => Promise<Uint8Array>): Promise<DagShape> {
  const blocks: CID[] = []
  let leaves: CID[] | null = []
  const visit = async (cid: CID): Promise<void> => {
    blocks.push(cid)
    if (cid.code === raw.code) { leaves?.push(cid); return }
    if (cid.code !== dagPb.code) { leaves = null; return }
    const node = dagPb.decode(await get(cid))
    if (node.Links.length === 0) {
      // A leaf with its data inline: not joinable as raw blocks.
      if ((node.Data?.length ?? 0) > 0) leaves = null
      return
    }
    for (const link of node.Links) await visit(link.Hash)
  }
  await visit(root)
  return { blocks, rawLeaves: leaves }
}
