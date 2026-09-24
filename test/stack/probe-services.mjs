/** What libp2p components are reachable from a running CadreNode? */
import { CadreNode } from '@serfab/cadre-core';
import { LevelDBRawStorage } from '@optimystic/db-p2p-storage-rn';
import { webSockets } from '@libp2p/websockets';
import { circuitRelayTransport } from '@libp2p/circuit-relay-v2';
import { generateKeyPair } from '@libp2p/crypto/keys';
import { randomUUID } from 'node:crypto';
import { openTestDb } from './classic-level-driver.mjs';

const node = new CadreNode({
  privateKey: await generateKeyPair('Ed25519'),
  controlNetwork: { partyId: randomUUID(), bootstrapNodes: [] },
  profile: 'transaction',
  strandFilter: { mode: 'all' },
  storage: { provider: (id) => new LevelDBRawStorage(openTestDb(`probe-${id}`, 0).db) },
  network: { transports: [webSockets(), circuitRelayTransport()], listenAddrs: [], requireRelay: false },
  hibernation: { enabled: false },
  requireSignedSchemas: false,
});
await node.start();

const ln = node.getControlNode();
console.log('getControlNode() ->', ln ? 'Libp2p instance' : 'null');
if (ln) {
  console.log('services keys:', Object.keys(ln.services ?? {}).join(', ') || '(none)');
  const cm = ln.services?.connectionMonitor ?? ln.components?.connectionMonitor;
  console.log('connectionMonitor reachable:', !!cm);
  if (cm) console.log('  methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(cm)).join(', '));
  // components bag is the other place libp2p keeps configured singletons
  const comp = ln.components;
  console.log('components keys:', comp ? Object.keys(comp).slice(0, 14).join(', ') : '(no .components)');
}
await node.stop();
process.exit(0);
