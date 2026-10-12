/**
 * chat-host.ts — this app's `ChatHost` for the core's Sereus model: the node is
 * `CadreService` (the cadre kit's phone node), and each slot is one AsyncStorage key,
 * named in `data/persisted-names.ts` and pinned by its test.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ChatHost, DurableSlot, NodeHost, SlotName } from '@chat/core/sereus';
import { STORAGE_KEYS } from '../data/persisted-names';
import { cadreService } from './CadreService';

function storageKey(name: SlotName, key?: string): string {
  switch (name) {
    case 'draft': return STORAGE_KEYS.draft(key ?? '');
    case 'readCursor': return STORAGE_KEYS.readCursor(key ?? '');
    default: return STORAGE_KEYS[name];
  }
}

function asyncStorageSlot(storageKeyName: string): DurableSlot {
  return {
    // AsyncStorage rejects on a failed read, as a slot must (never `undefined` for a fault).
    async load() { return (await AsyncStorage.getItem(storageKeyName)) ?? undefined; },
    async save(text: string) { await AsyncStorage.setItem(storageKeyName, text); },
  };
}

const nodeHost: NodeHost = {
  get node() { return cadreService.cadreNode; },
  ensureStarted: () => cadreService.ensureStarted(),
  on(event, handler) {
    cadreService.on(event, handler);
    return () => cadreService.off(event, handler);
  },
  onRebuilt(callback) {
    return cadreService.onRebuilt(callback);
  },
  partyId: () => cadreService.partyId,
  ownerEnrolled: () => cadreService.ownerEnrolled,
  getRelayAddrs: () => cadreService.getRelayAddrs(),
  applyRelays: addrs => cadreService.applyRelays(addrs),
  relayStatus: () => cadreService.getRelayReservationState()?.status ?? null,
  onReachabilityChange: callback => cadreService.onReachabilityChange(callback),
};

export const chatHost: ChatHost = {
  node: nodeHost,
  slot: (name, key) => asyncStorageSlot(storageKey(name, key)),
  dev: __DEV__,
};
