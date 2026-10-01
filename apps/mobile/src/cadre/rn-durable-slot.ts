/**
 * rn-durable-slot.ts — a `DurableSlot` over AsyncStorage, and a `KeyStore` on top
 * of the same storage.
 *
 * WHY BOTH EXIST. sereus 1.7.0 fixed the bug where two relay-only parties that
 * both restarted could never find each other again (gotchoices/sereus#18). The
 * fix is two pieces of state a node must keep across restarts — where the other
 * members were last seen (since 1.9, the strand nodes' saved routing table), and
 * which strands it joined from another party — and
 * its release notes are blunt about what happens if an app does not supply
 * somewhere to keep them: "either store left in memory reproduces the old
 * behaviour". cadre-core ships file-backed versions for Node and expects a
 * platform backend elsewhere. These are ours.
 *
 * A NOTE ON WHAT THIS IS NOT. `RNKeyStore` holds the joined-strand records,
 * which for a CLOSED strand include its read secret. AsyncStorage is app-private
 * but it is not a secure enclave, and this is the same posture the app already
 * takes for its peer identity (`loadOrCreateRNPeerKey`) — so this adds no new
 * exposure, but it is not an upgrade either. The sereus reference RN app backs
 * its keyStore with the platform secure store; when chat grows one, this is the
 * class to replace, and nothing above it needs to change.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { DurableSlot, KeyId, KeyStore } from '@serfab/cadre-core';
// NOT `globalThis.Buffer`. It type-checks (ambient Node types) and may be absent
// at runtime — the same shape as the `require.resolve('buffer')` trap that had
// our Metro config pointing at nothing for months. `uint8arrays` is what
// cadre-core itself uses, and it is now declared rather than borrowed
// transitively.
import { toString as bytesToString, fromString as bytesFromString } from 'uint8arrays';

/**
 * One named text slot.
 *
 * THE FAULT/ABSENT DISTINCTION IS LOAD-BEARING, and cadre-core's own contract
 * spells out why: `undefined` means "cold start, nothing was ever written here",
 * and a caller that sees it snapshot-writes the whole record. So a read that
 * FAILS must throw. Reporting a transient AsyncStorage error as `undefined`
 * would quietly convert a recoverable fault into the destruction of an intact
 * record on the very next save — losing exactly the addresses this store exists
 * to preserve, at exactly the moment they are needed.
 *
 * AsyncStorage's own API conflates the two: `getItem` answers `null` both for a
 * missing key and, on some backends, for a read it could not complete. It
 * rejects on a genuine failure, which is the signal relied on here: absence is
 * `null` from a resolved call, a fault is a rejection, and the rejection is
 * allowed to propagate rather than being caught into a default.
 */
export class AsyncStorageDurableSlot implements DurableSlot {
  constructor(private readonly key: string) {}

  async load(): Promise<string | undefined> {
    const raw = await AsyncStorage.getItem(this.key);
    return raw ?? undefined;
  }

  async save(text: string): Promise<void> {
    await AsyncStorage.setItem(this.key, text);
  }
}

/**
 * Where the strand nodes' saved network state lives (sereus 1.9: each strand
 * node's routing table, with every peer's signed address record). Slot names are
 * namespaced by party: two parties on one device must not share.
 */
export function strandNetworkStateSlot(partyId: string): DurableSlot {
  return new AsyncStorageDurableSlot(`@sereus.chat/strandNetworkState/${partyId}`);
}

/**
 * The 1.7–1.8 strand peer book's slot. Sereus 1.9 removed the book and no longer
 * reads it, so it is only ever deleted.
 */
export const LEGACY_STRAND_PEER_BOOK_PREFIX = '@sereus.chat/strandPeerBook/';

/**
 * A `KeyStore` over AsyncStorage.
 *
 * Only cadre-core writes here, and in this app its sole use is the joined-strand
 * records that `KeyStoreJoinedStrandStore` keeps — the node's own peer identity
 * still comes from `loadOrCreateRNPeerKey`, because the node is configured with
 * `privateKey` rather than a key store.
 *
 * Material is stored base64 because AsyncStorage is a string store; the raw
 * bytes round-trip through `Uint8Array` unchanged.
 */
export class RNKeyStore implements KeyStore {
  constructor(private readonly prefix = '@sereus.chat/keyStore') {}

  private slot(keyId: KeyId): string {
    // encodeURIComponent so a key id containing the separator cannot collide
    // with a different id, or escape into another store's namespace.
    return `${this.prefix}/${encodeURIComponent(keyId)}`;
  }

  async get(keyId: KeyId): Promise<Uint8Array | undefined> {
    const raw = await AsyncStorage.getItem(this.slot(keyId));
    if (raw == null) return undefined;
    return bytesFromString(raw, 'base64');
  }

  async set(keyId: KeyId, keyMaterial: Uint8Array): Promise<void> {
    await AsyncStorage.setItem(this.slot(keyId), bytesToString(keyMaterial, 'base64'));
  }

  async delete(keyId: KeyId): Promise<void> {
    await AsyncStorage.removeItem(this.slot(keyId));
  }

  async list(): Promise<KeyId[]> {
    const keys = await AsyncStorage.getAllKeys();
    const head = `${this.prefix}/`;
    return keys
      .filter(k => k.startsWith(head))
      .map(k => decodeURIComponent(k.slice(head.length)));
  }
}
