/**
 * This app's host for the core's Sereus model (`@chat/core/sereus`): one persistent node,
 * built as sereus's reference-app-ns builds its phone node (identity and node-local records
 * in SQLite, block storage per scope in SQLite, WebSockets and circuit relay, no listening),
 * plus the core's slots in the same SQLite key-value store.
 *
 * Same shape as serchat's host (apps/cli/src/host.ts): start options (party id, relays)
 * saved and reused; owner genesis on every start (idempotent); relays changed by rebuilding
 * the node.
 */
import {
  CadreNode,
  PersistentBootstrapPeerStore,
  PersistentEnrolledMachineStore,
  PersistentStrandNetworkStateStore,
  PersistentTrustedOwnerStore,
  type CadreNodeConfig,
} from '@serfab/cadre-core';
import { webSockets } from '@libp2p/websockets';
import { circuitRelayTransport } from '@libp2p/circuit-relay-v2';
import { openOptimysticNSDb, type OptimysticNSDBHandle } from '@optimystic/db-p2p-storage-ns';
import type { ChatHost, DurableSlot, NodeHost } from '@chat/core/sereus';
import { dbPath } from './db-path';
import { LocalKVStore, loadOrCreatePeerKey } from './local-kv';
import { makeLazyNsStorage } from './ns-storage';
import { anchorSlotKey, bootstrapPeersSlotKey, enrolledMachinesSlotKey, kvSlot, strandNetworkSlotKey } from './node-local-slots';

const DB_NAME = 'chat-node-local';
const START_KEY = 'chat:start';
const OWNER_GENESIS_MS = 60_000;

type StartOptions = { partyId: string; relays: string[] };
type Handler = { event: string; handler: (data: never) => void };

let opened: Promise<{ db: OptimysticNSDBHandle; kv: LocalKVStore }> | null = null;
const local = () => (opened ??= openOptimysticNSDb(dbPath(DB_NAME)).then(db => ({ db, kv: new LocalKVStore(db) })));

function randomUuid(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, ch => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function createNodeHost(): NodeHost {
  let node: CadreNode | null = null;
  let starting: Promise<void> | null = null;
  let options: StartOptions | null = null;
  let owner = false;
  const handlers: Handler[] = [];
  const rebuildHooks = new Set<() => void | Promise<void>>();
  const reachability = new Set<() => void>();

  async function startOptions(): Promise<StartOptions> {
    if (options) return options;
    const { kv } = await local();
    const saved = await kv.get(START_KEY);
    options = saved ? JSON.parse(saved) as StartOptions : { partyId: randomUuid(), relays: [] };
    if (!saved) await kv.set(START_KEY, JSON.stringify(options));
    return options;
  }

  async function start(): Promise<void> {
    const { db, kv } = await local();
    const opts = await startOptions();
    const slot = (key: string) => kvSlot(kv, key);
    const config: CadreNodeConfig = {
      privateKey: await loadOrCreatePeerKey(db),
      controlNetwork: { partyId: opts.partyId, bootstrapNodes: [] },
      profile: 'transaction',
      storage: { provider: (scope: string) => makeLazyNsStorage(scope) },
      network: {
        transports: [webSockets(), circuitRelayTransport()],
        listenAddrs: [],
        relayAddrs: opts.relays,
        requireRelay: false,
        // Plain ws:// relays and private addresses may be dialled; Noise and the pinned
        // peer id decide who answers (as the RN kit allows).
        connectionGater: { denyDialMultiaddr: () => false },
      },
      // As the RN app: only this sApp's strands.
      strandFilter: { mode: 'sAppId', sAppId: 'org.sereus.chat' },
      hibernation: { enabled: false },
      requireSignedSchemas: false,
      trustedOwners: { store: await PersistentTrustedOwnerStore.open(slot(anchorSlotKey(opts.partyId)), opts.partyId) },
      bootstrapPeers: { store: await PersistentBootstrapPeerStore.open(slot(bootstrapPeersSlotKey(opts.partyId)), opts.partyId) },
      enrolledMachines: { store: await PersistentEnrolledMachineStore.open(slot(enrolledMachinesSlotKey(opts.partyId)), opts.partyId) },
      strandNetworkState: { store: await PersistentStrandNetworkStateStore.open(slot(strandNetworkSlotKey(opts.partyId)), opts.partyId) },
    } as CadreNodeConfig;
    const built = new CadreNode(config);
    for (const { event, handler } of handlers) built.on(event as never, handler as never);
    await built.start();
    node = built;
    built.getControlNode()?.addEventListener('self:peer:update', () => reachability.forEach(cb => cb()));
    reachability.forEach(cb => cb());
    // Owner genesis, idempotent: the node must be an enrolled owner to publish strands.
    owner = await Promise.race([
      (async () => {
        const key = built.getIdentityOwnerKey();
        await built.getControlDatabase()!.ensureOwnerKey(key.publicKeyB64);
        await built.initializeSeedBootstrap(key.privateKeyB64);
        return true;
      })().catch(err => { console.warn('[host] owner genesis failed:', err); return false; }),
      new Promise<boolean>(resolve => setTimeout(() => resolve(false), OWNER_GENESIS_MS)),
    ]);
  }

  const host: NodeHost = {
    get node() { return node; },
    ensureStarted() {
      starting ??= start().catch(err => { starting = null; throw err; });
      return starting;
    },
    on(event, handler) {
      const entry: Handler = { event, handler: handler as Handler['handler'] };
      handlers.push(entry);
      node?.on(event, handler);
      return () => { handlers.splice(handlers.indexOf(entry), 1); node?.off(event, handler); };
    },
    onRebuilt(callback) {
      rebuildHooks.add(callback);
      return () => { rebuildHooks.delete(callback); };
    },
    async getRelayAddrs() { return [...(await startOptions()).relays]; },
    async applyRelays(addrs) {
      const opts = await startOptions();
      opts.relays = [...addrs];
      await (await local()).kv.set(START_KEY, JSON.stringify(opts));
      if (!node) return;
      const stopping = node;
      node = null;
      starting = null;
      owner = false;
      await stopping.stop();
      await host.ensureStarted();
      for (const hook of rebuildHooks) await hook();
    },
    partyId: () => options?.partyId ?? null,
    ownerEnrolled: () => owner,
    relayStatus: () => node?.getRelayReservationState()?.status ?? null,
    onReachabilityChange(callback) {
      reachability.add(callback);
      return () => { reachability.delete(callback); };
    },
  };
  return host;
}

/** The core's slots: one key each in the node-local key-value store. */
function slot(name: string, key?: string): DurableSlot {
  const id = `chat:slot:${name}${key === undefined ? '' : `:${key}`}`;
  return {
    async load() { return (await local()).kv.get(id); },
    async save(text: string) { await (await local()).kv.set(id, text); },
  };
}

export const chatHost: ChatHost = {
  node: createNodeHost(),
  slot: (name, key) => slot(name, key),
};
