/**
 * Does a strand founded with `foundStrand(…, { background: true })` come back after a restart,
 * as one founded in the foreground does? Bare cadre-core, one party, persistent file storage,
 * an in-process loopback relay. Run 1 founds one strand each way, waits until both are ready,
 * stops. Run 2 starts a new node over the same files and reports which strands it starts.
 *
 *   node test/stack/background-founding-restart.mjs
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createLibp2p } from 'libp2p';
import { webSockets } from '@libp2p/websockets';
import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { identify } from '@libp2p/identify';
import { circuitRelayServer, circuitRelayTransport } from '@libp2p/circuit-relay-v2';
import { CadreNode, DEFAULT_IDENTITY_KEY_ID, generateStrandMemberKey } from '@serfab/cadre-core';
import { FileKeyStore } from '@serfab/cadre-core/key-store-file';
import { FileTrustedOwnerStore } from '@serfab/cadre-core/trusted-owner-store-file';
import { FileBootstrapPeerStore } from '@serfab/cadre-core/bootstrap-peer-store-file';
import { FileEnrolledMachineStore } from '@serfab/cadre-core/enrolled-machine-store-file';
import { FileStrandNetworkStateStore } from '@serfab/cadre-core/strand-network-state-file';
import { runOwnerGenesis } from '@serfab/cadre-core/edge-node';
import { FileRawStorage } from '@optimystic/db-p2p-storage-fs';

const SAPP = {
  id: 'org.example.background-founding', version: '0.1.0', signature: '', latencyHint: 'interactive',
  schema: 'table Note (Id text primary key, Body text not null);',
};

const relay = await createLibp2p({
  addresses: { listen: ['/ip4/127.0.0.1/tcp/0/ws'] },
  transports: [webSockets()], connectionEncrypters: [noise()], streamMuxers: [yamux()],
  connectionGater: { denyDialMultiaddr: () => false },
  services: { identify: identify(), relay: circuitRelayServer({ reservations: { applyDefaultLimit: false } }) },
});
const relayAddr = relay.getMultiaddrs().map(String).find(a => a.includes('/ws'));
const dir = await mkdtemp(join(tmpdir(), 'bg-founding-'));
const partyId = `party-${randomUUID()}`;
const keyStore = new FileKeyStore(join(dir, 'keys'));

async function startNode() {
  const node = new CadreNode({
    keyStore, identityKeyId: DEFAULT_IDENTITY_KEY_ID,
    controlNetwork: { partyId, bootstrapNodes: [] },
    profile: 'transaction',
    strandFilter: { mode: 'sAppId', sAppId: SAPP.id },
    storage: { provider: scope => new FileRawStorage(join(dir, 'blocks', scope)) },
    network: { transports: [webSockets(), circuitRelayTransport()], listenAddrs: [], relayAddrs: [relayAddr], requireRelay: false, connectionGater: { denyDialMultiaddr: () => false } },
    hibernation: { enabled: false },
    requireSignedSchemas: false,
    trustedOwners: { store: await FileTrustedOwnerStore.open(join(dir, 'node'), partyId) },
    bootstrapPeers: { store: await FileBootstrapPeerStore.open(join(dir, 'node'), partyId) },
    enrolledMachines: { store: await FileEnrolledMachineStore.open(join(dir, 'node'), partyId) },
    strandNetworkState: { store: await FileStrandNetworkStateStore.open(join(dir, 'node'), partyId) },
  });
  // As an app does: a sAppConfig for strands this party holds, registered before they start.
  // As an app does (chat's StrandRuntime): attach what the control network offers — after a
  // restart that includes the strands this party founded — and drain offers made before.
  const attach = (strandId, strandRow) => {
    if (node.getStrands().has(strandId)) return;
    node.addStrand({ strandRow, sAppConfig: SAPP }).catch(err => console.log(`  attach ${strandId.slice(0, 2)} failed: ${err.message}`));
  };
  node.on('strand:discovered', ({ strandId, strand }) => attach(strandId, strand));
  await node.start();
  for (const [strandId, strandRow] of node.getDiscoveredStrands()) attach(strandId, strandRow);
  const genesis = await runOwnerGenesis(node, { keyStore, label: 'test' });
  return { node, genesis };
}

// Run 1: found one strand each way, wait until both are running, stop.
const first = await startNode();
console.log(`run 1: genesis ${first.genesis}`);
const fg = `fg-${randomUUID()}`, bg = `bg-${randomUUID()}`;
await first.node.foundStrand({ strandId: fg, type: 'c', memberPrivateKey: await generateStrandMemberKey(), sAppConfig: SAPP });
const { ready } = await first.node.foundStrand({ strandId: bg, type: 'c', memberPrivateKey: await generateStrandMemberKey(), sAppConfig: SAPP }, { background: true });
await ready;
console.log(`run 1: running ${[...first.node.getStrands().keys()].map(id => id.slice(0, 2)).join(', ')}`);
const rows1 = await first.node.getControlDatabase().queryStrands?.() ?? [];
console.log(`run 1: control Strand rows ${JSON.stringify(rows1.map(r => ({ id: r.Id.slice(0, 2), founderPeer: r.FounderPeerId ? 'self?' + (r.FounderPeerId === first.node.peerId.toString()) : r.FounderPeerId, founderOwner: !!r.FounderOwnerKey })))}`);
await first.node.stop();

// Run 2: same files, a new node; which strands does it start?
const second = await startNode();
console.log(`run 2: genesis ${second.genesis}`);
const deadline = Date.now() + 30_000;
while (Date.now() < deadline && second.node.getStrands().size < 2) await new Promise(r => setTimeout(r, 500));
const running = [...second.node.getStrands().keys()];
console.log(`run 2 after ${Math.round((30_000 - (deadline - Date.now())) / 1000)} s: foreground-founded ${running.includes(fg) ? 'RUNNING' : 'NOT running'}, background-founded ${running.includes(bg) ? 'RUNNING' : 'NOT running'}`);
await second.node.stop();
await relay.stop();
await rm(dir, { recursive: true, force: true }).catch(() => {}); // a late write may still land
process.exit(0);
