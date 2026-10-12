/**
 * Node codes: the `sereus-join:1.…` text a cadre node shows (as a QR code, a link or plain
 * text) while it waits to be claimed, and how to read one and sort a claim's failure.
 *
 * INTERIM: ported from health (`apps/mobile/src/cadre/nodeCode.ts`, `nodeCodeLink.ts`),
 * which calls itself a candidate for a shared sereus package. Two copies until that
 * exists (gotchoices/sereus#45 proposes sharing the platform-neutral cadre code); then
 * this file goes and the core imports it. Differences from health's: a small built-in
 * private-address check instead of `@libp2p/utils`'s `isPrivateIp`, so the core takes no
 * extra dependency.
 *
 * SECURITY: a code carries the node's one-time claim secret. Never log the code text, a
 * link containing one, or a decoded payload — log the peer id only.
 */
import {
  ClaimRefusedError,
  NODE_CLAIM_PAYLOAD_PREFIX,
  PeerUnreachableError,
  decodeNodeClaimPayload,
  type NodeClaimPayload,
} from '@serfab/cadre-core';
import type { NodeReach } from '../model/index.js';

export { NODE_CODE_SCHEME, isNodeCode, nodeCodeFromUrl } from '../protocol/index.js';
import { NODE_CODE_SCHEME, nodeCodeFromUrl } from '../protocol/index.js';

/** A code with a version this build does not read: `sereus-join:<n>.` with n ≠ 1. */
const VERSIONED_NODE_CODE = /^sereus-join:(\d+)\./;

export type NodeCodeProblem =
  /** Does not start with `sereus-join:` — some other QR, link or text. */
  | 'not-node-code'
  /** A node code from a newer node than this build reads: the app needs updating. */
  | 'newer-version'
  /** Right prefix, but cut short or corrupted. */
  | 'damaged';

export type NodeCodeReading =
  | { ok: true; payload: NodeClaimPayload }
  | { ok: false; problem: NodeCodeProblem; /** The decoder's words (never the secret), for logs. */ detail?: string };

/** Decode scanned or pasted text, or say which problem it has. */
export function readNodeCode(text: string): NodeCodeReading {
  const trimmed = (nodeCodeFromUrl(text) ?? text).trim();
  if (!trimmed.startsWith(NODE_CODE_SCHEME)) return { ok: false, problem: 'not-node-code' };
  if (!trimmed.startsWith(NODE_CLAIM_PAYLOAD_PREFIX) && VERSIONED_NODE_CODE.test(trimmed)) {
    return { ok: false, problem: 'newer-version' };
  }
  try {
    return { ok: true, payload: decodeNodeClaimPayload(trimmed) };
  } catch (err) {
    // The decoder never echoes the secret, so its message is safe to keep.
    return { ok: false, problem: 'damaged', detail: err instanceof Error ? err.message : String(err) };
  }
}

/** `anywhere` when at least one address names a public IP or a DNS name, else `home-network`. */
export function nodeReach(multiaddrs: readonly string[]): NodeReach {
  return multiaddrs.some(isPublicAddress) ? 'anywhere' : 'home-network';
}

/**
 * The address's host is a DNS name or a public IP. The host is its first IP or DNS
 * component, so a relayed address is judged by its relay.
 */
export function isPublicAddress(addr: string): boolean {
  const parts = addr.split('/').filter(Boolean);
  for (let i = 0; i < parts.length - 1; i++) {
    const [proto, value] = [parts[i], parts[i + 1]];
    if (proto === 'dns' || proto === 'dns4' || proto === 'dns6' || proto === 'dnsaddr') return true;
    if (proto === 'ip4') return !isPrivateIp4(value);
    if (proto === 'ip6') return !isPrivateIp6(value);
    if (proto === 'ip6zone') return false; // a zone names a local interface: link-local only
  }
  return false;
}

function isPrivateIp4(ip: string): boolean {
  const o = ip.split('.').map(Number);
  if (o.length !== 4 || o.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return true; // unparsable: not public
  const [a, b] = o;
  return a === 10 || a === 127 || a === 0
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 169 && b === 254)
    || (a === 100 && b >= 64 && b <= 127); // carrier-grade NAT, Tailscale
}

function isPrivateIp6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === '::1' || lower === '::') return true;
  if (lower.startsWith('::ffff:')) return isPrivateIp4(lower.slice(7));
  const first = parseInt(lower.split(':')[0] || '0', 16);
  return (first & 0xfe00) === 0xfc00   // fc00::/7 unique local
    || (first & 0xffc0) === 0xfe80;     // fe80::/10 link local
}

/** Refusals after which the same code can still succeed. */
const RETRYABLE_REFUSALS: ReadonlySet<string> = new Set(['claim-rate-limited', 'claim-not-persisted']);

export type ClaimFailure =
  /** No connection formed from any address; nothing was sent. */
  | { kind: 'node-unreachable'; reach: NodeReach; retryable: true; detail: string }
  /** The node answered and said no. `refusal` is absent when it gave no (known) code. */
  | { kind: 'claim-refused'; refusal?: string; retryable: boolean; detail: string }
  /** Reached, then the exchange or a local step failed. Repeating with the same code is safe. */
  | { kind: 'claim-failed'; retryable: true; detail: string };

/** Sort an error thrown by `CadreNode.claimNode(payload)` into what to say and whether to keep the code. */
export function classifyClaimFailure(error: unknown, payload: NodeClaimPayload): ClaimFailure {
  const detail = error instanceof Error ? error.message : String(error);
  if (error instanceof PeerUnreachableError) {
    return { kind: 'node-unreachable', reach: nodeReach(payload.multiaddrs), retryable: true, detail };
  }
  if (error instanceof ClaimRefusedError) {
    const refusal = error.code;
    return {
      kind: 'claim-refused',
      refusal,
      retryable: refusal !== undefined && RETRYABLE_REFUSALS.has(refusal),
      detail: error.reason ?? detail,
    };
  }
  return { kind: 'claim-failed', retryable: true, detail };
}
