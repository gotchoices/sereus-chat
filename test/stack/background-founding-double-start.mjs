/**
 * A strand founded with `foundStrand(…, { background: true })` is published before it runs, so
 * the strand watcher can offer it as `strand:discovered` while cadre's own background start is
 * in flight, and an app that attaches what it is offered (as apps must, to get their strands
 * back after a restart) calls `addStrand` for it too. Two starts of one strand then run at once.
 * Does a joiner still get in?
 *
 * Bare cadre-core, two relay-only parties in one process, blocks in memory, a loopback relay.
 *   MODE=double   A attaches its own new strand as an app's discovery handler would (default)
 *   MODE=single   A leaves it to cadre's background start (the control)
 *   MODE=wake     A reads it at once, as an app's view of a new conversation does: the
 *                 instance is `starting` with no database, so the app calls `wakeStrand`
 *
 *   STORAGE=file  blocks on disk (db-p2p-storage-fs), as serchat stores them: a much slower start
 *
 *   node test/stack/background-founding-double-start.mjs
 */
import { randomUUID } from 'node:crypto';
import { createLibp2p } from 'libp2p';
import { webSockets } from '@libp2p/websockets';
import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { identify } from '@libp2p/identify';
import { circuitRelayServer, circuitRelayTransport } from '@libp2p/circuit-relay-v2';
import { generateKeyPair } from '@libp2p/crypto/keys';
import { MemoryRawStorage } from '@optimystic/db-p2p';
import { CadreNode, generateStrandMemberKey, InMemoryKeyStore } from '@serfab/cadre-core';
import { runOwnerGenesis } from '@serfab/cadre-core/edge-node';
import { FileRawStorage } from '@optimystic/db-p2p-storage-fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const MODE = process.env.MODE ?? 'double';
const SAPP = { id: 'org.example.double-start', version: '0.1.0', signature: '', latencyHint: 'interactive', schema: 'table Note (Id text primary key, Body text not null);' };
const t0 = Date.now();
const say = line => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${line}`);

const relay = await createLibp2p({ addresses: { listen: ['/ip4/127.0.0.1/tcp/0/ws'] }, transports: [webSockets()], connectionEncrypters: [noise()], streamMuxers: [yamux()], connectionGater: { denyDialMultiaddr: () => false }, services: { identify: identify(), relay: circuitRelayServer({ reservations: { applyDefaultLimit: false } }) } });
const relayAddr = relay.getMultiaddrs().map(String).find(a => a.includes('/ws'));

async function party(tag) {
  const node = new CadreNode({
    privateKey: await generateKeyPair('Ed25519'),
    controlNetwork: { partyId: `${tag}-${randomUUID()}`, bootstrapNodes: [] },
    profile: 'transaction', strandFilter: { mode: 'all' },
    storage: { provider: process.env.STORAGE === 'file' ? (dir => scope => new FileRawStorage(join(dir, scope)))(mkdtempSync(join(tmpdir(), `double-${tag}-`))) : () => new MemoryRawStorage() },
    network: { transports: [webSockets(), circuitRelayTransport()], listenAddrs: [], relayAddrs: [relayAddr], requireRelay: false, connectionGater: { denyDialMultiaddr: () => false } },
    hibernation: { enabled: false }, requireSignedSchemas: false,
  });
  await node.start();
  const genesis = await runOwnerGenesis(node, { keyStore: new InMemoryKeyStore(), label: tag });
  while (node.getMultiaddrs().length === 0) await new Promise(r => setTimeout(r, 100));
  say(`${tag}: started, genesis ${genesis}`);
  return node;
}

const A = await party('founder');
const B = await party('joiner');
let offered = 0;
// An app's discovery handler (chat's StrandRuntime does this): attach what is offered.
A.on('strand:discovered', ({ strandId, strand }) => {
  offered++;
  say(`founder: strand:discovered for ${strandId.slice(0, 8)} (running: ${A.getStrands().has(strandId)})`);
  if (MODE === 'double' && !A.getStrands().has(strandId)) {
    A.addStrand({ strandRow: strand, sAppConfig: SAPP }).then(() => say('founder: discovery addStrand resolved'), err => say(`founder: discovery addStrand failed: ${err.message}`));
  }
});

const strandId = `strand-${randomUUID()}`;
const { strandRow, ready } = await A.foundStrand({ strandId, type: 'c', memberPrivateKey: await generateStrandMemberKey(), sAppConfig: SAPP }, { background: true });
say('founder: published');
if (MODE === 'double') {
  // Deterministically what the watcher's offer leads to when its poll lands in the window.
  A.addStrand({ strandRow, sAppConfig: SAPP }).then(() => say('founder: second addStrand resolved'), err => say(`founder: second addStrand failed: ${err.message}`));
}
if (MODE === 'wake') {
  const inst = A.getStrands().get(strandId);
  say(`founder: instance ${inst ? `status=${inst.status} database=${!!inst.database}` : 'not tracked yet'}`);
  A.wakeStrand(strandId).then(() => say('founder: wakeStrand resolved'), err => say(`founder: wakeStrand failed: ${err.message}`));
}
await ready.then(() => say('founder: ready resolved'), err => say(`founder: ready rejected: ${err.message}`));
const invitation = await A.createOpenInvitation(SAPP.id, 3_600_000);
await A.publishFormationInvite(invitation.token, SAPP.id, { strandId, expiresAtMs: Date.now() + 3_600_000, totalUses: 1 });
const code = A.encodeInvitation(invitation);

let joined = false;
for (let attempt = 1; attempt <= 6 && !joined; attempt++) {
  try {
    const formed = await B.formStrand(B.decodeInvitation(code), { metadata: { name: 'B' } });
    await B.addStrand({ strandRow: { Id: formed.strandId, MemberPrivateKey: formed.memberPrivateKey ?? null, Type: 'c', FounderOwnerKey: null, FounderPeerId: null }, sAppConfig: SAPP, awaitFirstSync: false });
    await B.whenStrandWritable(formed.strandId, { timeoutMs: 60_000 });
    joined = true;
    say(`joiner: joined on attempt ${attempt}`);
  } catch (err) {
    say(`joiner: attempt ${attempt} failed: ${err.name}: ${err.message.slice(0, 140)}`);
    await new Promise(r => setTimeout(r, 5000));
  }
}
say(`RESULT mode=${MODE}: ${joined ? 'joiner got in' : 'joiner NEVER got in'}; strand:discovered offers seen by the founder: ${offered}`);
await Promise.allSettled([A.stop(), B.stop()]); await relay.stop(); process.exit(0);
