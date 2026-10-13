/**
 * extra-node.ts — diagnostics' platform pieces. `createExtraNode`: a second, throwaway
 * party's node on this phone, configured as the app's own node runs — relay-only, the kit's
 * native Noise crypto — over LevelDB names under a `diag2-` prefix, so it can neither
 * disturb the app's data nor be disturbed by it. `@chat/core/diagnostics`' two-party check
 * builds its two parties with it.
 */
import { CadreNode, type CadreNodeConfig } from '@serfab/cadre-core';
import { generateKeyPair } from '@libp2p/crypto/keys';
import { webSockets } from '@libp2p/websockets';
import { circuitRelayTransport } from '@libp2p/circuit-relay-v2';
import { LevelDBRawStorage, openOptimysticRNDb } from '@optimystic/db-p2p-storage-rn';
import { LevelDB, LevelDBWriteBatch } from 'rn-leveldb';
import { buildNoiseCrypto, DEFAULT_NOISE_CRYPTO_MODE } from '@serfab/cadre-rn/noise-crypto';
import type { CreateExtraNode } from '@chat/core/sereus';
import type { FoundStrandPlatform } from '@chat/core/diagnostics';

export const createExtraNode: CreateExtraNode = async ({ tag, partyId, relayAddrs }) => {
  const prefix = `diag2-${Math.random().toString(36).slice(2, 10)}-${tag}`;
  const config = {
    privateKey: await generateKeyPair('Ed25519'),
    controlNetwork: { partyId, bootstrapNodes: [] },
    profile: 'transaction',
    strandFilter: { mode: 'all' },
    storage: {
      provider: (scope: string) => new LevelDBRawStorage(openOptimysticRNDb({
        openFn: (n: string, createIfMissing: boolean, errorIfExists: boolean) => new LevelDB(n, createIfMissing, errorIfExists),
        WriteBatch: LevelDBWriteBatch,
        name: `${prefix}-${scope}`,
      })),
    },
    network: {
      transports: [webSockets(), circuitRelayTransport()],
      // A phone cannot listen; the relay is the only way in.
      listenAddrs: [],
      relayAddrs,
      noiseCrypto: buildNoiseCrypto(DEFAULT_NOISE_CRYPTO_MODE),
      // Fail-soft, as the app is: `start()` may return before the first reservation.
      requireRelay: false,
      // As the kit configures the app's own node: React Native resolves libp2p's browser
      // connection gater, which refuses plain ws://, loopback and private addresses — so a
      // relay at ws:// is never even dialled. Noise and the pinned peer id still decide who
      // answers.
      connectionGater: { denyDialMultiaddr: () => false },
      // DECLARED, not measured, above the 2000 ms default: every relay deadline counts in
      // round trips (4x this for a reservation), and a diagnostic run adds nodes to a phone
      // already running one. At the default both test parties missed the reservation at
      // exactly 8033 ms while the app's own node reserved in 4043 ms.
      linkRoundTripMs: 6000,
    },
    hibernation: { enabled: false },
    requireSignedSchemas: false,
  } as unknown as CadreNodeConfig;
  const node = new CadreNode(config);
  await node.start();
  return node;
};

/**
 * The phone's side of the found-strand check: `LevelDBRawStorage` over rn-leveldb under a
 * `diag-` prefix (never the app's own stores), WebSockets, a fresh identity.
 */
export async function foundStrandPlatform(): Promise<FoundStrandPlatform> {
  const id = Math.random().toString(36).slice(2, 10);
  const dbs = new Map<string, ReturnType<typeof openOptimysticRNDb>>();
  const openDb = (name: string) => {
    let db = dbs.get(name);
    if (!db) {
      db = openOptimysticRNDb({
        openFn: (n: string, createIfMissing: boolean, errorIfExists: boolean) => new LevelDB(n, createIfMissing, errorIfExists),
        WriteBatch: LevelDBWriteBatch,
        name: `diag-${id}-${name}`,
      });
      dbs.set(name, db);
    }
    return db;
  };
  return {
    storage: (scope: string) => new LevelDBRawStorage(openDb(scope)),
    transports: [webSockets()] as never,
    privateKey: await generateKeyPair('Ed25519'),
    cleanup: () => {
      for (const db of dbs.values()) {
        try { (db as unknown as { close?: () => void }).close?.(); } catch { /* best effort */ }
      }
    },
  };
}
