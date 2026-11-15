/**
 * Spike (strand-ipfs branch, PERF_LOG builds only): do Helia's Bitswap and UnixFS run under Hermes? Once, after the
 * node starts: Helia over the node's control libp2p node, 1 MB added with UnixFS and read back,
 * each step timed. Nothing leaves the phone; Helia is stopped afterwards (the node is not).
 */
import { StrandIpfs } from '@chat/strand-ipfs';
import { unixfs } from '@helia/unixfs';
import { MemoryBlockstore } from 'blockstore-core';
import type { Libp2p } from '@libp2p/interface';

let ran = false;

export async function ipfsSmoke(libp2p: Libp2p): Promise<void> {
  if (ran) return;
  ran = true;
  const t0 = Date.now();
  try {
    const helia = new StrandIpfs({ libp2p, blockstore: new MemoryBlockstore() });
    await helia.start();
    const tStart = Date.now() - t0;
    const bytes = new Uint8Array(1_000_000);
    for (let at = 0; at < bytes.length; at += 65_536) crypto.getRandomValues(bytes.subarray(at, Math.min(at + 65_536, bytes.length)));
    const fs = unixfs(helia);
    let t = Date.now();
    const cid = await fs.addBytes(bytes);
    const addMs = Date.now() - t;
    t = Date.now();
    let n = 0;
    for await (const piece of fs.cat(cid)) n += piece.length;
    const catMs = Date.now() - t;
    await helia.stop();
    console.info(`[ipfs smoke] OK: helia up in ${tStart} ms, add 1 MB ${addMs} ms, cat ${n} bytes ${catMs} ms, cid ${cid.toString()}`);
  } catch (err) {
    console.warn('[ipfs smoke] FAILED:', err instanceof Error ? `${err.name}: ${err.message}\n${err.stack}` : String(err));
  }
}
