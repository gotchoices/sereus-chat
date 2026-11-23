/**
 * A circuit relay on loopback, in this process, for checks that need one (phones reach each other
 * only through a relay). Relayed connections are not limited: Optimystic's database services abort
 * limited streams.
 *
 *   const relay = await startLocalRelay(); … relay.addr …; await relay.stop();
 *   node local-relay.mjs        # run one on its own and print its address
 */
import { createLibp2p } from 'libp2p';
import { webSockets } from '@libp2p/websockets';
import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { identify } from '@libp2p/identify';
import { circuitRelayServer } from '@libp2p/circuit-relay-v2';
import { fileURLToPath } from 'node:url';

export async function startLocalRelay() {
  const node = await createLibp2p({
    addresses: { listen: ['/ip4/127.0.0.1/tcp/0/ws'] },
    transports: [webSockets()],
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()],
    connectionGater: { denyDialMultiaddr: () => false },
    services: { identify: identify(), relay: circuitRelayServer({ reservations: { applyDefaultLimit: false } }) },
  });
  const addr = node.getMultiaddrs().map(String).find(a => a.includes('/ws/'));
  if (!addr) throw new Error('the local relay has no WebSocket address');
  return { addr, stop: () => node.stop() };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const relay = await startLocalRelay();
  console.log(relay.addr);
  process.on('SIGINT', async () => { await relay.stop(); process.exit(0); });
}
