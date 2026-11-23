/**
 * One sereus node and a strand of a tiny app schema, with nothing of chat in it: for tests of the
 * stack itself (`src/upstream/`), written so they could be handed upstream as they are.
 *
 *   const { node, strand, stop } = await soloStrand('repro', 'table T (Id text primary key)');
 */
import { CadreNode, InMemoryKeyStore, generateStrandMemberKey, type StrandInstance } from '@serfab/cadre-core';
import { runOwnerGenesis } from '@serfab/cadre-core/edge-node';
import { MemoryRawStorage } from '@optimystic/db-p2p';
import { generateKeyPair } from '@libp2p/crypto/keys';
import { webSockets } from '@libp2p/websockets';
import { randomUUID } from 'node:crypto';

export const SOLO_SAPP_ID = 'org.example.solo';

export interface SoloStrand {
  node: CadreNode;
  strand: StrandInstance;
  stop(): Promise<void>;
}

/** A started node (an enrolled owner, no peers) with one founded strand whose `App` schema is `ddl`. */
export async function soloStrand(tag: string, ddl: string): Promise<SoloStrand> {
  const scopes = new Map<string, MemoryRawStorage>();
  const ownerKeyStore = new InMemoryKeyStore();
  const node = new CadreNode({
    privateKey: await generateKeyPair('Ed25519'),
    controlNetwork: { partyId: `${tag}-${randomUUID()}`, bootstrapNodes: [] },
    nodeClass: 'device',
    strandFilter: { mode: 'sAppId', sAppId: SOLO_SAPP_ID },
    storage: {
      provider: (scope: string) => {
        let storage = scopes.get(scope);
        if (!storage) scopes.set(scope, (storage = new MemoryRawStorage()));
        return storage;
      },
    },
    network: {
      transports: [webSockets()] as never,
      listenAddrs: ['/ip4/127.0.0.1/tcp/0/ws'],
      relayAddrs: [],
      requireRelay: false,
      connectionGater: { denyDialMultiaddr: () => false },
    },
    requireSignedSchemas: false,
  });
  await node.start();
  const stop = async () => { await node.stop().catch(() => {}); };
  try {
    const genesis = await runOwnerGenesis(node, { keyStore: ownerKeyStore, label: tag });
    if (genesis !== 'enrolled') throw new Error(`${tag}: owner genesis did not enrol (${String(genesis)})`);
    const founded = await node.foundStrand({
      strandId: `strand-${randomUUID()}`,
      type: 'c',
      memberPrivateKey: await generateStrandMemberKey(),
      sAppConfig: { id: SOLO_SAPP_ID, version: '1.0.0', schemaVersion: 1, schema: ddl, signature: '', latencyHint: 'interactive' } as never,
    });
    return { node, strand: founded.instance, stop };
  } catch (err) {
    await stop();
    throw err;
  }
}
