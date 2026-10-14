/**
 * What `@chat/core/diagnostics` needs from this platform — the NativeScript side of the
 * same checks the React Native app (apps/mobile/src/host/extra-node.ts) and Node run:
 * SQLite block storage (`db-p2p-storage-ns`, through sereus's reference-app-ns adapter)
 * under a `diag-` prefix, browser-variant WebSockets and circuit relay, fresh identities.
 *
 * Noise runs its pure-JS crypto here (webpack redirects noise's node crypto to noble), so
 * these numbers are V8's JIT on pure JavaScript — exactly what the probe asks.
 */
import { CadreNode, type CadreNodeConfig } from '@serfab/cadre-core';
import { generateKeyPair } from '@libp2p/crypto/keys';
import { webSockets } from '@libp2p/websockets';
import { circuitRelayTransport } from '@libp2p/circuit-relay-v2';
import type { FoundStrandPlatform } from '@chat/core/diagnostics';
import type { CreateExtraNode } from '@chat/core/sereus';
import { makeLazyNsStorage } from './ns-storage';

const runId = () => Math.random().toString(36).slice(2, 10);

export async function foundStrandPlatform(): Promise<FoundStrandPlatform> {
  const id = runId();
  return {
    storage: (scope: string) => makeLazyNsStorage(`diag-${id}-${scope}`),
    transports: [webSockets()] as never,
    privateKey: await generateKeyPair('Ed25519'),
  };
}

export const createExtraNode: CreateExtraNode = async ({ tag, partyId, relayAddrs }) => {
  const prefix = `diag2-${runId()}-${tag}`;
  const node = new CadreNode({
    privateKey: await generateKeyPair('Ed25519'),
    controlNetwork: { partyId, bootstrapNodes: [] },
    profile: 'transaction',
    strandFilter: { mode: 'all' },
    storage: { provider: (scope: string) => makeLazyNsStorage(`${prefix}-${scope}`) },
    network: {
      transports: [webSockets(), circuitRelayTransport()],
      listenAddrs: [],
      relayAddrs,
      requireRelay: false,
      connectionGater: { denyDialMultiaddr: () => false },
      // As the RN app's extra node: a declared slow link, since a diagnostic run adds
      // nodes to a phone (see apps/mobile/src/host/extra-node.ts).
      linkRoundTripMs: 6000,
    },
    hibernation: { enabled: false },
    requireSignedSchemas: false,
  } as unknown as CadreNodeConfig);
  await node.start();
  return node;
};
