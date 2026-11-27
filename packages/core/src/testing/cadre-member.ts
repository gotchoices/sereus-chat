/**
 * A cadre member for tests: an always-on machine (`nodeClass: 'server'`, every strand of its
 * party as a replica) that a test party claims with its node code, as the phone claims a
 * cadre-cli node. Listens on loopback WebSocket and holds a reservation on the test relay.
 */
import { randomBytes } from 'node:crypto';
import { CadreNode, encodeNodeClaimPayload, type CadreNodeConfig, type NodeClaimRecord } from '@serfab/cadre-core';
import { memoryNodeStorage, type OpenNodeStorage } from '@optimystic/db-p2p';
import { generateKeyPair } from '@libp2p/crypto/keys';
import { webSockets } from '@libp2p/websockets';
import { circuitRelayTransport } from '@libp2p/circuit-relay-v2';
import type { TestParty } from './node-host.js';

export interface CadreMember {
  /** The member's node now: claiming restarts it, so read it each time. */
  readonly node: CadreNode;
  /** Its own direct WebSocket addresses (no relay hop), each ending in `/p2p/<peerId>`. */
  directAddrs(): string[];
  stop(): Promise<void>;
}

/** Start a member, have `owner` claim it, and restart it into `owner`'s party, as cadre-cli does. */
export async function claimCadreMember(relayAddr: string, owner: TestParty, log: (text: string) => void = () => {}): Promise<CadreMember> {
  const secret = randomBytes(32).toString('base64url');
  const scopes = new Map<string, OpenNodeStorage>();
  const privateKey = await generateKeyPair('Ed25519');
  let claimed: NodeClaimRecord | null = null;
  const base = (): Omit<CadreNodeConfig, 'controlNetwork'> => ({
    privateKey,
    nodeClass: 'server',
    strandFilter: { mode: 'all' },
    storage: { open: async (scope: string) => scopes.get(scope) ?? scopes.set(scope, memoryNodeStorage()).get(scope)! },
    network: {
      transports: [webSockets(), circuitRelayTransport()] as never,
      listenAddrs: ['/ip4/127.0.0.1/tcp/0/ws'],
      relayAddrs: [relayAddr],
      connectionGater: { denyDialMultiaddr: () => false },
    },
    hibernation: { enabled: false },
    requireSignedSchemas: false,
  });
  let node = new CadreNode({
    ...base(),
    controlNetwork: { partyId: 'unclaimed', bootstrapNodes: [] },
    claim: { secret, record: async c => { claimed = c; } },
  } as CadreNodeConfig);
  await node.start();
  const directAddrs = () => node.getMultiaddrs().map(m => m.toString()).filter(a => a.includes('/ws') && !a.includes('p2p-circuit'));

  const code = encodeNodeClaimPayload({ peerId: node.peerId!.toString(), multiaddrs: directAddrs(), secret });
  const result = await owner.model.cadre.claimNode(code);
  if (!result.ok) throw new Error(`claimNode: ${result.error.kind}: ${result.error.message}`);
  log(`${owner.tag} claimed a cadre member`);
  const claim = claimed as NodeClaimRecord | null;
  if (!claim) throw new Error('the claim was not recorded');
  await node.stop();
  node = new CadreNode({
    ...base(),
    controlNetwork: { partyId: claim.partyId, bootstrapNodes: owner.node.getMultiaddrs().map(m => m.toString()) },
    trustedOwners: { pinnedKeys: [claim.ownerKey], pinnedSource: 'claim' },
  } as CadreNodeConfig);
  await node.start();
  log(`the cadre member restarted into ${owner.tag}'s party`);
  return {
    get node() { return node; },
    directAddrs,
    stop: () => node.stop(),
  };
}
