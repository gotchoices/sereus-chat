/**
 * Reproduction (sereus): a blob put on a strand node is gone after the strand hibernates and wakes.
 *
 * Optimystic 1.29 gives every node a blob service (`node.blobs`). Its release notes say a host must
 * supply `NodeOptions.pieceStorage` and a persistent `kvStore`; without them the node keeps pieces
 * in a `MemoryPieceStore`. Sereus builds strand nodes without either, and hibernating a strand
 * stops its node, so the wake builds a new node with an empty store. On a phone a strand hibernates
 * whenever the app goes to the background, so a photo sent just before that, and not yet fetched by
 * anyone, is lost.
 *
 * Expected: after `hibernateStrand` and `wakeStrand` (and after a node restart), the blob still
 * reads as `here` and its bytes read back.
 *
 *   node test/stack/blob-survives-hibernate.mjs
 *
 * One node, no peers, file storage for blocks. Exit 0 when the expected happens.
 */
import { randomBytes } from 'node:crypto';
import { soloStrand, versions } from './solo-node.mjs';

console.log(await versions());
const { node, strand, stop } = await soloStrand('blob-hibernate', 'table T (Id text primary key)');
const strandId = strand.strandId;
const blobs = () => {
  const b = node.getStrands().get(strandId)?.libp2pNode?.blobs;
  if (!b) throw new Error('the strand node has no blob service (Optimystic 1.29 or later is needed)');
  return b;
};
let code = 0;
try {
  const bytes = new Uint8Array(randomBytes(1_000_000));
  async function* source() { for (let i = 0; i < bytes.length; i += 64 * 1024) yield bytes.subarray(i, i + 64 * 1024); }
  const { ref, size } = await blobs().put(source());
  console.log(`put ${size} bytes as ${ref}`);
  console.log(`before: ${(await blobs().stat(ref)).locality}`);

  await node.hibernateStrand(strandId);
  await node.wakeStrand(strandId);
  const after = await blobs().stat(ref);
  console.log(`after hibernate and wake: ${after.locality} (${after.heldBytes} bytes held)`);
  if (after.locality !== 'here') {
    code = 1;
    console.error('FAIL: the blob did not survive the strand hibernating and waking');
  } else {
    let got = 0;
    for await (const piece of blobs().read(ref, { from: 'here' })) got += piece.length;
    console.log(`read back ${got} bytes`);
    if (got !== bytes.length) { code = 1; console.error('FAIL: the bytes read back short'); }
    else console.log('PASS: the blob survives the strand hibernating and waking');
  }
} finally {
  await stop();
}
process.exit(code);
