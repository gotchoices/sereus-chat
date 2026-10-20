/**
 * What an app supplies to run the Sereus model: its node, and durable text slots for
 * device-local state (docs/app-family.md, "The host").
 *
 * The app builds the node (on React Native, the cadre kit's `createPhoneNode`); the core
 * never constructs one. The app also decides where slots live (AsyncStorage, IndexedDB,
 * a file, memory) and pins their persisted names.
 */
import type { CadreNode, CadreNodeEvents, DurableSlot, KeyStore } from '@serfab/cadre-core';

export type { DurableSlot };

/** The device-local records the Sereus model keeps. `draft` and `readCursor` are per strand. */
export type SlotName =
  | 'profile'
  | 'prefs'
  | 'strandPrefs'
  | 'strandSummaries'
  | 'joinedStrands'
  | 'outgoingInvitations'
  | 'preparedStrands'
  | 'draft'
  | 'readCursor';

export interface NodeHost {
  /** The running node, or null while stopped or starting. */
  readonly node: CadreNode | null;
  /**
   * Start the node if it is not running — with the options it last ran with, or as a
   * fresh party on first run — and resolve once it runs. Idempotent; concurrent calls
   * share one start. Rejects with the start's error.
   */
  ensureStarted(): Promise<void>;
  /**
   * Subscribe to node events for the life of the host, not of one node: the host
   * re-attaches the handler to every node it builds, so a restart drops nothing.
   */
  on<K extends keyof CadreNodeEvents>(event: K, handler: (data: CadreNodeEvents[K]) => void): () => void;
  /**
   * Run after a REBUILD-driven restart (relays changed, say), so the model can re-read
   * anything offered to the old node while it was going away.
   */
  onRebuilt(callback: () => void | Promise<void>): () => void;
  /**
   * Relays live in the node's start options, saved with every start: one copy of the
   * setting. These read them, and change them (restarting the node if it runs).
   */
  getRelayAddrs(): Promise<string[]>;
  applyRelays(addrs: string[]): Promise<void>;
  /** This party's id: the node's, or the one the next start will use. */
  partyId(): string | null;
  /** This device is an enrolled owner (owner genesis ran), so it can sign claims. */
  ownerEnrolled(): boolean;
  /** The relay reservation's status now (`RelayReservationState.status`), or null with no node. */
  relayStatus(): string | null;
  /** This device's addresses changed (a reservation granted, lost or moved), or its node restarted. */
  onReachabilityChange(callback: () => void): () => void;
}

/** Build and start a fresh party's node: relay-only, isolated storage. */
export type CreateExtraNode = (opts: { tag: string; partyId: string; relayAddrs: string[] }) => Promise<CadreNode>;

export interface ChatHost {
  node: NodeHost;
  /** The slot for one record. `key` names the strand for per-strand records. */
  slot(name: SlotName, key?: string): DurableSlot;
  /**
   * Where this device keeps its owner key (cadre-core's owner slot, `DEFAULT_OWNER_KEY_ID`),
   * which since sereus 1.17 is separate from the machine's identity. Read only to export the
   * key for backup (`cadre.exportOwnerKey`); absent, there is nothing to export.
   */
  ownerKeyStore?: KeyStore;
  /**
   * Diagnostics only: build and start a second, throwaway party's node in this process,
   * relay-only, with storage the host chooses (never the app's own). Checks that need a
   * second party (`@chat/core/diagnostics` `runTwoPartyCheck`) use it; without it they
   * report themselves unavailable.
   */
  createExtraNode?: CreateExtraNode;
  /** Development build: step timings and narrated joins in the log. */
  dev?: boolean;
}
