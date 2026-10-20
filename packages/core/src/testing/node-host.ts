/**
 * A `ChatHost` in Node, for the contract suite and integration runs: a real cadre-core
 * node with in-memory block storage and in-memory slots, and an in-process circuit relay
 * for the relay-only topology phones live in.
 */
import { CadreNode, InMemoryKeyStore } from '@serfab/cadre-core';
import { runOwnerGenesis } from '@serfab/cadre-core/edge-node';
import { MemoryRawStorage } from '@optimystic/db-p2p';
import { generateKeyPair } from '@libp2p/crypto/keys';
import { webSockets } from '@libp2p/websockets';
import { circuitRelayServer, circuitRelayTransport } from '@libp2p/circuit-relay-v2';
import { identify } from '@libp2p/identify';
import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { createLibp2p } from 'libp2p';
import { CHAT_SAPP_ID } from '../protocol/index.js';
import { createSereusModel, type SereusModel } from '../sereus/model.js';
import type { ChatHost, DurableSlot, NodeHost } from '../sereus/host.js';
import { newId } from '../sereus/operations.js';

/** A circuit relay in this process, listening on loopback WebSockets. */
export async function startRelay(): Promise<{ addr: string; stop(): Promise<void> }> {
  const relay = await createLibp2p({
    addresses: { listen: ['/ip4/127.0.0.1/tcp/0/ws'] },
    transports: [webSockets()],
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()],
    connectionGater: { denyDialMultiaddr: () => false },
    services: {
      identify: identify(),
      // Unlimited, as the app's relay runs: optimystic's services abort limited streams.
      relay: circuitRelayServer({ reservations: { applyDefaultLimit: false } }),
    },
  });
  const addr = relay.getMultiaddrs().map(a => a.toString()).find(a => a.includes('/ws'));
  if (!addr) throw new Error('relay has no WebSocket address');
  return { addr, stop: async () => { await relay.stop(); } };
}

export function memorySlots(): (name: string, key?: string) => DurableSlot {
  const values = new Map<string, string>();
  return (name, key) => {
    const id = key === undefined ? name : `${name}/${key}`;
    return {
      async load() { return values.get(id); },
      async save(text: string) { values.set(id, text); },
    };
  };
}

export interface TestParty extends SereusModel {
  tag: string;
  host: ChatHost;
  node: CadreNode;
  stop(): Promise<void>;
}

/**
 * One party: its own node, slots and Sereus model. `relayAddr` set and `listen` false is
 * the phone's topology (no listen address; reachable only through the relay).
 */
export async function createTestParty(tag: string, opts: { relayAddr?: string; listen?: boolean }): Promise<TestParty> {
  const scopes = new Map<string, MemoryRawStorage>();
  const partyId = `${tag}-${newId()}`;
  let owned = false;
  // This party's owner key, apart from the machine's identity (sereus 1.17).
  const ownerKeyStore = new InMemoryKeyStore();
  const relayAddrs = opts.relayAddr ? [opts.relayAddr] : [];
  const node = new CadreNode({
    privateKey: await generateKeyPair('Ed25519'),
    controlNetwork: { partyId, bootstrapNodes: [] },
    profile: 'transaction',
    strandFilter: { mode: 'sAppId', sAppId: CHAT_SAPP_ID },
    storage: {
      provider: (scope: string) => {
        let storage = scopes.get(scope);
        if (!storage) scopes.set(scope, (storage = new MemoryRawStorage()));
        return storage;
      },
    },
    network: {
      transports: [webSockets(), circuitRelayTransport()] as never,
      listenAddrs: opts.listen ? ['/ip4/127.0.0.1/tcp/0/ws'] : [],
      relayAddrs,
      requireRelay: false,
      connectionGater: { denyDialMultiaddr: () => false },
    },
    requireSignedSchemas: false,
  });

  let started: Promise<void> | null = null;
  const nodeHost: NodeHost = {
    get node() { return node.isRunning ? node : null; },
    ensureStarted() {
      started ??= (async () => {
        await node.start();
        // Owner genesis, as the cadre kit runs it: the node must be an enrolled owner to
        // publish strands and invitations.
        const genesis = await runOwnerGenesis(node, { keyStore: ownerKeyStore, label: tag });
        if (genesis !== 'enrolled') throw new Error(`${tag}: owner genesis did not enrol (${String(genesis)})`);
        owned = true;
      })();
      return started;
    },
    on(event, handler) {
      node.on(event, handler);
      return () => node.off(event, handler);
    },
    onRebuilt() { return () => {}; },
    async getRelayAddrs() { return [...relayAddrs]; },
    async applyRelays() { throw new Error('the test host does not change relays'); },
    partyId: () => partyId,
    ownerEnrolled: () => owned,
    relayStatus: () => (node.isRunning ? node.getRelayReservationState()?.status ?? null : null),
    onReachabilityChange(callback) {
      const control = node.getControlNode();
      if (!control) return () => {};
      control.addEventListener('self:peer:update', callback);
      return () => control.removeEventListener('self:peer:update', callback);
    },
  };
  const host: ChatHost = { node: nodeHost, slot: memorySlots(), ownerKeyStore };
  const { model, boot } = createSereusModel(host);
  return { tag, host, node, model, boot, stop: () => node.stop() };
}

/** Wait until `check` holds, polling; throws with `what` after `ms`. */
export async function until(check: () => boolean | Promise<boolean>, what: string, ms = 60_000): Promise<void> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise<void>(r => setTimeout(r, 250));
  }
  throw new Error(`timed out waiting for ${what}`);
}
