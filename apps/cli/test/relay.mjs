// A loopback circuit relay for serchat runs by hand (the scenario suite starts its own in
// the test): `node apps/cli/test/relay.mjs [port]` prints its address and runs until Ctrl-C.
import { createLibp2p } from 'libp2p';
import { webSockets } from '@libp2p/websockets';
import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { identify } from '@libp2p/identify';
import { circuitRelayServer } from '@libp2p/circuit-relay-v2';

const port = Number(process.argv[2] ?? 0);
const relay = await createLibp2p({
  addresses: { listen: [`/ip4/127.0.0.1/tcp/${port}/ws`] },
  transports: [webSockets()],
  connectionEncrypters: [noise()],
  streamMuxers: [yamux()],
  connectionGater: { denyDialMultiaddr: () => false },
  services: { identify: identify(), relay: circuitRelayServer({ reservations: { applyDefaultLimit: false } }) },
});
console.log(relay.getMultiaddrs().map(a => a.toString()).find(a => a.includes('/ws')));
process.on('SIGINT', async () => { await relay.stop(); process.exit(0); });
