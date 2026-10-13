/**
 * Results and errors. Model operations return `Result<T>` and do not throw for failures
 * a screen must handle; a thrown error is a defect.
 *
 * A `ChatError` carries a stable `kind` that UIs render through the string catalogs
 * (`@chat/resources`: `errors.<kind>`, or `errors.<kind>.<reason>`), and `retryable`,
 * which says whether trying again can help. `message` is English text for logs, and the
 * words to show when a catalog has none.
 */

export type ChatErrorKind =
  /** Nobody can answer an invitation from this device: no address yet (story 02 Alt A). */
  | 'unreachable'
  /** The strand is not on this device. */
  | 'not-attached'
  /** The data could not be read or written right now (a peer, the cohort, a timeout). */
  | 'unavailable'
  /** This device could not be registered as a member of the strand. */
  | 'not-a-member'
  /** Joining: the inviter could not be reached. */
  | 'join-inviter-unreachable'
  /** Joining: the invitation was already used or has expired. */
  | 'invitation-spent'
  /** Joining: the inviter's side does not know the invitation yet. */
  | 'invitation-not-ready'
  /** Joining: the inviter refused this join. */
  | 'join-refused'
  /** Joining: the inviter's side could not finish just now. */
  | 'join-host-busy'
  /** Joining: the strand was made by an older version and takes no new members. */
  | 'join-host-outdated'
  /** Joining: approved, but this device could not finish setting the strand up. */
  | 'join-incomplete'
  /** Joining: the invitation cannot be used, for a reason with no kind of its own. */
  | 'invitation-unusable'
  /** A node code that cannot be used; `reason`: `not-node-code`, `newer-version` or `damaged`. */
  | 'invalid-node-code'
  /** Claiming a node: no address answered. `reason`: the node's reach, `anywhere` or `home-network`. */
  | 'node-unreachable'
  /** Claiming a node: it answered and said no. `reason`: its refusal code, when it sent one. */
  | 'claim-refused'
  /** Claiming a node: reached, then the exchange or a local step failed. Safe to repeat. */
  | 'claim-failed'
  /** The operation exists in the model but this implementation cannot do it yet. */
  | 'not-supported'
  /** Anything else. */
  | 'unexpected';

/** Every kind, for catalogs and tools that must cover them all. */
const KINDS: Record<ChatErrorKind, true> = {
  'unreachable': true, 'not-attached': true, 'unavailable': true, 'not-a-member': true,
  'join-inviter-unreachable': true, 'invitation-spent': true, 'invitation-not-ready': true,
  'join-refused': true, 'join-host-busy': true, 'join-host-outdated': true, 'join-incomplete': true,
  'invitation-unusable': true, 'invalid-node-code': true, 'node-unreachable': true,
  'claim-refused': true, 'claim-failed': true, 'not-supported': true, 'unexpected': true,
};
export const CHAT_ERROR_KINDS = Object.keys(KINDS) as readonly ChatErrorKind[];

export interface ChatError {
  kind: ChatErrorKind;
  retryable: boolean;
  message: string;
  /** A finer, stable code within the kind (e.g. a claim refusal), for the UI to choose words. */
  reason?: string;
  /** The underlying error, for logs. */
  cause?: unknown;
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: ChatError };

export function ok<T>(value: T): Result<T>;
export function ok(): Result<void>;
export function ok<T>(value?: T): Result<T | undefined> {
  return { ok: true, value };
}

export function fail<T = never>(kind: ChatErrorKind, message: string, opts: { retryable?: boolean; reason?: string; cause?: unknown } = {}): Result<T> {
  return { ok: false, error: { kind, message, retryable: opts.retryable ?? defaultRetryable(kind), reason: opts.reason, cause: opts.cause } };
}

const RETRYABLE: ReadonlySet<ChatErrorKind> = new Set<ChatErrorKind>([
  'unreachable', 'unavailable', 'not-a-member', 'join-inviter-unreachable', 'invitation-not-ready', 'join-host-busy',
  'node-unreachable', 'claim-failed',
]);

export function defaultRetryable(kind: ChatErrorKind): boolean {
  return RETRYABLE.has(kind);
}
