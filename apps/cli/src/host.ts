/**
 * serchat's host for the core's Sereus model (`@chat/core/sereus`): a cadre-core node
 * kept on disk in the profile folder, and the core's slots as files.
 *
 * The node is shaped like the phone's (cadre-rn's `buildPhoneNodeConfig`: transaction
 * profile, reachable through relays, no hibernation) so serchat behaves as a phone would
 * on the network, with Node's file-backed stores in place of the phone's keychain and
 * LevelDB (as sereus's `cadre-cli` builds them). `--listen` adds a listen address, which
 * a phone cannot have, so two profiles on one machine can talk without a relay.
 */
import { readFile } from 'node:fs/promises';
import { createServer, type AddressInfo } from 'node:net';
import { join } from 'node:path';
import { CadreNode, DEFAULT_IDENTITY_KEY_ID, type CadreNodeConfig } from '@serfab/cadre-core';
import { FileKeyStore } from '@serfab/cadre-core/key-store-file';
import { runOwnerGenesis } from '@serfab/cadre-core/edge-node';
import { FileTrustedOwnerStore } from '@serfab/cadre-core/trusted-owner-store-file';
import { FileBootstrapPeerStore } from '@serfab/cadre-core/bootstrap-peer-store-file';
import { FileEnrolledMachineStore } from '@serfab/cadre-core/enrolled-machine-store-file';
import { FileStrandNetworkStateStore } from '@serfab/cadre-core/strand-network-state-file';
import { FileKVStore, FileRawStorage } from '@optimystic/db-p2p-storage-fs';
import { MemoryRawStorage } from '@optimystic/db-p2p';
import { webSockets } from '@libp2p/websockets';
import { circuitRelayTransport } from '@libp2p/circuit-relay-v2';
import { CHAT_SAPP_ID } from '@chat/core';
import type { ChatHost, DurableSlot, NodeHost, SlotName } from '@chat/core/sereus';
import { saveConfig, writeTextAtomic, type ProfileConfig, type ProfileDirs } from './home.js';

/** `--listen` with no address: loopback, on the profile's own port (see `listenAddress`). */
export const DEFAULT_LISTEN = 'default';

/** The profile's listen address: its saved port, or a free one chosen now and saved. */
export async function defaultListenAddress(dirs: ProfileDirs, config: ProfileConfig): Promise<string> {
  if (!config.listenPort) {
    config.listenPort = await freePort();
    await saveConfig(dirs, config);
  }
  return `/ip4/127.0.0.1/tcp/${config.listenPort}/ws`;
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      server.close(() => resolve(port));
    });
  });
}
/** Owner genesis is bounded, as the phone kit bounds it: a start must not hang on it. */
const OWNER_GENESIS_MS = 60_000;

export interface HostOptions {
  dirs: ProfileDirs;
  config: ProfileConfig;
  /** Relays for this run only, beside the saved ones. */
  extraRelays: string[];
  /** Listen addresses for this run (`--listen`). */
  listen: string[];
  dev: boolean;
  /**
   * Measurement only: strand and control blocks in memory, not on disk (`--memory-blocks`).
   * Nothing survives the process; used to separate storage cost from protocol cost.
   */
  memoryBlocks?: boolean;
  /**
   * Strand offline mode (`--offline`), as the RN app runs it: a write returns once saved in
   * the strand's journal here and is sent later. Off by default, so a command's timing is the
   * stack's real cost (docs/async-writes.md §5). Journals live under `<profile>/journal/`.
   */
  offline?: boolean;
  /** Run the party's private strand (`--private-strand`; `ChatHost.privateStrand`). Measurement stage. */
  privateStrand?: boolean;
}

export interface CliHost extends ChatHost {
  node: NodeHost & { stop(): Promise<void>; listenAddrs(): string[] };
}

type Handler = { event: string; handler: (data: never) => void };

export function createCliHost(opts: HostOptions): CliHost {
  const { dirs, config } = opts;
  let node: CadreNode | null = null;
  let starting: Promise<void> | null = null;
  let owner = false;
  const handlers: Handler[] = [];
  const rebuildHooks = new Set<() => void | Promise<void>>();
  const reachabilityCallbacks = new Set<() => void>();

  const memoryScopes = new Map<string, MemoryRawStorage>();
  const journals = new Map<string, FileKVStore>();
  /**
   * Every block store this host built. The one that builds a store closes it (Optimystic
   * `IRawStorage.close`): writes are grouped in memory and flushed on a timer, so a store left
   * open loses the last moments' writes, a block just replicated here included, when the
   * process exits. Measured: a node stopped about 3 s after taking the other member's write
   * did not have it after a restart (test/stack/offline-restart-hides-peer-rows.mjs, CLOSE=0).
   */
  const stores: FileRawStorage[] = [];
  const track = (store: FileRawStorage) => { stores.push(store); return store; };
  // The node's identity and, in its own slot, the party's owner key (separate since sereus 1.17).
  const keyStore = new FileKeyStore(dirs.keys);
  const relays = () => [...new Set([...config.relays, ...opts.extraRelays])];

  async function build(): Promise<CadreNode> {
    const { partyId } = config;
    const nodeConfig: CadreNodeConfig = {
      keyStore,
      identityKeyId: DEFAULT_IDENTITY_KEY_ID,
      controlNetwork: { partyId, bootstrapNodes: [] },
      profile: 'transaction',
      storage: {
        provider: opts.memoryBlocks
          ? (scope: string) => memoryScopes.get(scope) ?? memoryScopes.set(scope, new MemoryRawStorage()).get(scope)!
          : (scope: string) => track(new FileRawStorage(join(dirs.blocks, scope))),
      },
      network: {
        transports: [webSockets(), circuitRelayTransport()] as never,
        listenAddrs: opts.listen,
        relayAddrs: relays(),
        requireRelay: false,
        // Plain ws://, loopback and private addresses are fine to dial: Noise and the pinned
        // peer id decide who answers (as the phone kit allows).
        connectionGater: { denyDialMultiaddr: () => false },
      },
      // Chat strands only, unless this party runs its private strand too: an sApp filter
      // stops a strand once its sApp is known not to match.
      strandFilter: opts.privateStrand ? { mode: 'all' } : { mode: 'sAppId', sAppId: CHAT_SAPP_ID },
      hibernation: { enabled: false },
      requireSignedSchemas: false,
      trustedOwners: { store: await FileTrustedOwnerStore.open(dirs.node, partyId) },
      bootstrapPeers: { store: await FileBootstrapPeerStore.open(dirs.node, partyId) },
      enrolledMachines: { store: await FileEnrolledMachineStore.open(dirs.node, partyId) },
      strandNetworkState: { store: await FileStrandNetworkStateStore.open(dirs.node, partyId) },
      ...(opts.offline ? {
        strandOffline: {
          // One store per strand for the life of the process: a second store over the same
          // directory would not see the first one's unflushed writes.
          journal: (scope: string) => journals.get(scope)
            ?? journals.set(scope, new FileKVStore(join(dirs.root, 'journal', scope))).get(scope)!,
          initialMode: 'offline' as const,
        },
      } : {}),
    };
    const built = new CadreNode(nodeConfig);
    for (const { event, handler } of handlers) built.on(event as never, handler as never);
    return built;
  }

  async function start(): Promise<void> {
    const built = await build();
    await built.start();
    node = built;
    const control = built.getControlNode();
    control?.addEventListener('self:peer:update', () => reachabilityCallbacks.forEach(cb => cb()));
    reachabilityCallbacks.forEach(cb => cb());
    // Owner genesis, as cadre-core's edge node runs it on every start (idempotent, bounded,
    // fail-soft): the owner slot's key — created on the first start — becomes the founding
    // owner. The node must be an enrolled owner to publish strands and invitations.
    const genesis = await runOwnerGenesis(built, { keyStore, label: 'serchat', timeoutMs: OWNER_GENESIS_MS });
    if (genesis !== 'enrolled') console.warn(`[serchat] owner genesis: ${genesis}`);
    owner = genesis === 'enrolled';
  }

  async function stop(): Promise<void> {
    const stopping = node;
    node = null;
    starting = null;
    owner = false;
    if (stopping) await stopping.stop();
    // Flush and release what this host built, now that the node no longer uses it.
    const closing = [...stores.splice(0), ...journals.values()];
    journals.clear();
    await Promise.allSettled(closing.map(store => store.close()));
  }

  const nodeHost: CliHost['node'] = {
    get node() { return node; },
    ensureStarted() {
      starting ??= start().catch(err => { starting = null; throw err; });
      return starting;
    },
    on(event, handler) {
      const entry: Handler = { event, handler: handler as Handler['handler'] };
      handlers.push(entry);
      node?.on(event, handler);
      return () => {
        handlers.splice(handlers.indexOf(entry), 1);
        node?.off(event, handler);
      };
    },
    onRebuilt(callback) {
      rebuildHooks.add(callback);
      return () => { rebuildHooks.delete(callback); };
    },
    async getRelayAddrs() { return relays(); },
    async applyRelays(addrs) {
      config.relays = [...addrs];
      await saveConfig(dirs, config);
      if (!node) return;
      // Relays are start options: rebuild the node with them.
      await stop();
      await nodeHost.ensureStarted();
      for (const hook of rebuildHooks) await hook();
    },
    partyId: () => config.partyId,
    ownerEnrolled: () => owner,
    relayStatus: () => node?.getRelayReservationState()?.status ?? null,
    onReachabilityChange(callback) {
      reachabilityCallbacks.add(callback);
      return () => { reachabilityCallbacks.delete(callback); };
    },
    stop,
    listenAddrs: () => node?.getControlNode()?.getMultiaddrs().map(a => a.toString()) ?? [],
  };

  return {
    node: nodeHost,
    slot: (name, key) => fileSlot(dirs, name, key),
    ownerKeyStore: keyStore,
    dev: opts.dev,
    privateStrand: opts.privateStrand,
  };
}

/** One file per slot: `slots/<name>`, or `slots/<name>--<key>` for keyed slots (drafts, read cursors). */
function fileSlot(dirs: ProfileDirs, name: SlotName, key?: string): DurableSlot {
  const file = join(dirs.slots, key === undefined ? name : `${name}--${encodeURIComponent(key)}`);
  return {
    // A missing file is an empty slot; any other read failure rejects, as a slot must.
    async load() {
      try {
        return await readFile(file, 'utf8');
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
        throw err;
      }
    },
    save: (text: string) => writeTextAtomic(file, text),
  };
}
