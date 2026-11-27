/**
 * What an app supplies to run the Sereus model: its node, and durable text slots for
 * device-local state (docs/app-family.md, "The host").
 *
 * The app builds the node (on React Native, the cadre kit's `createPhoneNode`); the core
 * never constructs one. The app also decides where slots live (AsyncStorage, IndexedDB,
 * a file, memory) and pins their persisted names.
 */
import type { CadreNode, DurableSlot, KeyStore } from '@serfab/cadre-core';
import type { CadreNodeHost } from '@chat/cadre-client/sereus';

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
  /** This device's writes still being followed to delivery, and refused ones (`delivery.ts`). */
  | 'outbox'
  | 'draft'
  | 'readCursor'
  /** How invitations name this person's cadrons (`@chat/cadre-client`'s `CadronPreferences`). */
  | 'cadronPreferences';

/**
 * The node, as the chat model needs it: everything the cadre client needs
 * (`CadreNodeHost`: the node, events across restarts, relays, party id, owner standing,
 * reachability changes) plus starting it and hearing about rebuilds.
 */
export interface NodeHost extends CadreNodeHost {
  /**
   * Start the node if it is not running — with the options it last ran with, or as a
   * fresh party on first run — and resolve once it runs. Idempotent; concurrent calls
   * share one start. Rejects with the start's error.
   */
  ensureStarted(): Promise<void>;
  /**
   * Run after a REBUILD-driven restart (relays changed, say), so the model can re-read
   * anything offered to the old node while it was going away.
   */
  onRebuilt(callback: () => void | Promise<void>): () => void;
}

/** Build and start a fresh party's node: relay-only, isolated storage. */
export type CreateExtraNode = (opts: { tag: string; partyId: string; relayAddrs: string[] }) => Promise<CadreNode>;

/**
 * The device's files (docs/blobs.md): reading a file the user picked, in pieces, and keeping a
 * viewable copy of each file in a strand (`strand-files.ts`). Supplied by each app (Node `fs`, a React Native file library,
 * the browser's own), so `@chat/core` stays platform-free. Without it, attachments carry no bytes.
 */
export interface FileAccess {
  /** A local file's size in bytes. */
  size(uri: string): Promise<number>;
  /** A local file's bytes in order, in pieces of about `pieceSize`. */
  read(uri: string, pieceSize: number): AsyncIterable<Uint8Array>;
  /** Where this device keeps its copy of a blob (stable for a ref; `name` keeps the extension). */
  cachePath(ref: string, name?: string): string;
  exists(uri: string): Promise<boolean>;
  /** Write `pieces` in order to `uri`, replacing it: through a temporary file, so a reader never sees half. */
  write(uri: string, pieces: AsyncIterable<Uint8Array>): Promise<void>;
  /** Optional: copy a file natively (a phone's own copy of a file it sends, without base64). */
  copy?(from: string, to: string): Promise<void>;
}

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
   * Found an invitation's new conversation with sereus 1.17's background form (sereus#49):
   * published now, the invitation minted at once, the strand started in the background and
   * listed as connecting meanwhile. Default on; `false` founds in the foreground. A host
   * that may stop soon after (serchat's one-shot runs) awaits `SereusModel.settle()` first.
   */
  backgroundFounding?: boolean;
  /**
   * Diagnostics only: build and start a second, throwaway party's node in this process,
   * relay-only, with storage the host chooses (never the app's own). Checks that need a
   * second party (`@chat/core/diagnostics` `runTwoPartyCheck`) use it; without it they
   * report themselves unavailable.
   */
  createExtraNode?: CreateExtraNode;
  /** Development build: step timings and narrated joins in the log. */
  dev?: boolean;
  /** The device's files: attachments and the drive's files (docs/blobs.md, `strand-files.ts`). */
  files?: FileAccess;
  /** The largest attachment this device sends, in bytes (story 20: the user's own limit). Default 25 MB. */
  maxAttachmentBytes?: number;
  /**
   * How a slow device brings strands up (docs/STATUS.md, 2026-11-17): at start-up and after a
   * return, the `recentCount` most recently active strands and any active within `recentMs`,
   * one at a time `gapMs` apart; the rest stay asleep until opened. Unset (a computer, an
   * always-on peer): every strand, one at a time, with no pause.
   *
   * `rotateMs`: while the app is in front (`strands.rotate(true)`), visit one sleeping strand
   * this often, so a quiet strand still hears from its members (`rotate` in model.ts), but only
   * once the user has left the app alone for `idleMs` (`strands.interacted`).
   */
  strandStart?: { recentCount: number; recentMs: number; gapMs: number; rotateMs?: number; idleMs?: number };
}
