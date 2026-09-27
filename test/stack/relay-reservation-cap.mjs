/**
 * relay-reservation-cap.mjs — how many circuit-relay reservations will one relay
 * grant us at once?
 *
 * WHY. The in-app two-party check cannot get a relay reservation for a SECOND
 * cadre node on a device whose first node already holds one: `reserveRelays`
 * burns its whole budget (8033 ms at the 2000 ms default link round trip, 24038 ms
 * when that is raised to 6000) and produces no address, while the app's own node
 * reserved in 3-4 s on the same relay moments earlier. Two explanations fit, and
 * they lead opposite ways:
 *
 *   · the RELAY refuses us — a per-peer, per-IP or global reservation cap — in
 *     which case the app is fine and the test rig needs rethinking; or
 *   · REACT NATIVE cannot complete a second reservation — in which case it is a
 *     runtime finding, and a close relative of gotchoices/Optimystic#23.
 *
 * This separates them without a device. Plain libp2p nodes, no cadre, no
 * optimystic: open N of them from this machine against the same relay and count
 * how many end up with a `/p2p-circuit` address. Node has none of React Native's
 * constraints, so if N reservations succeed here the relay is not the limit.
 *
 *   node test/stack/relay-reservation-cap.mjs [relay-multiaddr] [count]
 *
 * Defaults to the sereus relay and 4 nodes. Nodes are opened one at a time, so a
 * failure names the first N that stopped working rather than failing as a batch.
 */
import { createLibp2p } from 'libp2p';
import { webSockets } from '@libp2p/websockets';
import { circuitRelayTransport } from '@libp2p/circuit-relay-v2';
import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { identify } from '@libp2p/identify';
import { multiaddr } from '@multiformats/multiaddr';

const RELAY = process.argv[2]
  ?? '/dns4/relay.sereus.org/tcp/4011/ws/p2p/12D3KooWMD7E7UH4rkCqiFE69n7FNqrKo1Xx3yDUU8JvwtaH39bD';
const COUNT = Number(process.argv[3] ?? 4);
/** Generous on purpose: the question is whether it EVER lands, not how fast. */
const RESERVE_WAIT_MS = 30_000;

const log = (...a) => console.log(...a);

async function openOne(index) {
  const node = await createLibp2p({
    addresses: {
      // The bare `/p2p-circuit` search listener — the same thing naming a relay
      // in cadre's `network.relayAddrs` adds, and what turns a reservation into
      // a dialable address.
      listen: ['/p2p-circuit'],
    },
    transports: [webSockets(), circuitRelayTransport()],
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()],
    services: { identify: identify() },
  });

  const started = Date.now();
  await node.dial(multiaddr(RELAY));

  // The reservation is asynchronous to the dial: the transport requests it once
  // the connection is up, and the address appears when the relay grants it.
  let addrs = [];
  while (Date.now() - started < RESERVE_WAIT_MS) {
    addrs = node.getMultiaddrs().map(m => m.toString()).filter(a => a.includes('p2p-circuit'));
    if (addrs.length > 0) break;
    await new Promise(r => setTimeout(r, 250));
  }

  const ms = Date.now() - started;
  if (addrs.length > 0) {
    log(`  node ${index}: RESERVED in ${ms} ms — ${addrs[0]}`);
  } else {
    log(`  node ${index}: NO RESERVATION after ${ms} ms (connections: ${node.getConnections().length})`);
  }
  return { node, ok: addrs.length > 0, ms };
}

const results = [];
log(`relay: ${RELAY}`);
log(`opening ${COUNT} nodes, one at a time…`);
try {
  for (let i = 1; i <= COUNT; i++) {
    try {
      results.push(await openOne(i));
    } catch (err) {
      log(`  node ${i}: FAILED to dial — ${err?.message ?? err}`);
      results.push({ node: null, ok: false, ms: -1 });
    }
  }

  const ok = results.filter(r => r.ok).length;
  log('');
  log(`${ok} of ${COUNT} nodes hold a reservation on this relay simultaneously.`);
  if (ok === COUNT) {
    log('The relay grants every one of them. It is not capping us —');
    log('so a second reservation failing on the phone is a React Native finding.');
  } else if (ok === 0) {
    log('None succeeded — check the relay is up and the multiaddr is right before reading anything into it.');
  } else {
    log(`The relay stopped granting after ${ok}. That is a relay-side cap, and the`);
    log('in-app two-party check needs a relay that allows more, not a code change.');
  }
} finally {
  for (const r of results) {
    try { await r.node?.stop(); } catch { /* best effort */ }
  }
}
