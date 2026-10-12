/**
 * The cadre: this party's own machines (story 42, "adds a machine of their own").
 *
 * Machines join the way sereus 1.14 has them join: a node waiting to be claimed shows a
 * node code (`sereus-join:1.…`, as a QR code, a link or text); the owner's device reads
 * it, the person approves, and the device claims the node. A code carries the node's
 * one-time claim secret: it is never logged, and only the peer id appears in logs.
 */
import type { Result } from './result.js';

export type CadreMachine = {
  peerId: string;
  /** This device. */
  thisDevice: boolean;
  /** Where the cadre last recorded it as reachable; may be empty. */
  addresses: string[];
};

export type CadreStatus = {
  running: boolean;
  partyId: string | null;
  peerId: string | null;
  /** This device is an enrolled owner of its cadre, so it can claim and remove machines. */
  ownerEnrolled: boolean;
  /** First characters of the owner key: the fingerprint a claimed node shows as its owner. */
  ownerFingerprint: string | null;
  /** This device first, then the others. */
  machines: CadreMachine[];
};

/** Where this device can reach a node from: `anywhere` (a public address or name) or `home-network`. */
export type NodeReach = 'anywhere' | 'home-network';

/** What a node code says, shown for approval before a claim. Never includes the secret. */
export type NodeCodePreview = {
  peerId: string;
  addresses: string[];
  reach: NodeReach;
};

export interface CadreModel {
  status(): Promise<Result<CadreStatus>>;
  /** Read scanned or pasted text. Fails `invalid-node-code` with the problem as `reason`. */
  inspectNodeCode(text: string): Promise<Result<NodeCodePreview>>;
  /**
   * Claim the node the code names, after the person approved (a link can be sent by
   * anyone, so a code never claims on its own). Can take two minutes when no address
   * answers. Fails `invalid-node-code`, `node-unreachable`, `claim-refused` (`retryable`
   * says whether the same code can still work) or `claim-failed`.
   */
  claimNode(text: string): Promise<Result<void>>;
  /** Take a machine out of the cadre. */
  removeMachine(peerId: string): Promise<Result<void>>;
  /**
   * The owner key's private half, for an offline backup. It IS this device's identity
   * secret: only behind an explicit, confirmed action, and never logged.
   */
  exportOwnerKey(): Promise<Result<string>>;
}

/** First 8 characters of an owner key: the fingerprint a claimed node shows as its owner. */
export function ownerFingerprint(publicKeyB64: string): string {
  return publicKeyB64.slice(0, 8);
}

/** `…` + the last 8 characters: enough to match the peer id a node prints. */
export function shortPeerId(peerId: string): string {
  return peerId.length > 12 ? `…${peerId.slice(-8)}` : peerId;
}
