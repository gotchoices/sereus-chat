/**
 * Results and errors. Model operations return `Result<T>` and do not throw for failures
 * a screen must handle; a thrown error is a defect.
 *
 * A `ChatError` carries a stable `kind` that UIs render through the string catalogs
 * (packages/resources, Phase 7), and `retryable`, which says whether trying again can
 * help. `message` is English text for logs and, until the catalogs exist, for display.
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
  /** Anything else. */
  | 'unexpected';

export interface ChatError {
  kind: ChatErrorKind;
  retryable: boolean;
  message: string;
  /** The underlying error, for logs. */
  cause?: unknown;
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: ChatError };

export function ok<T>(value: T): Result<T>;
export function ok(): Result<void>;
export function ok<T>(value?: T): Result<T | undefined> {
  return { ok: true, value };
}

export function fail<T = never>(kind: ChatErrorKind, message: string, opts: { retryable?: boolean; cause?: unknown } = {}): Result<T> {
  return { ok: false, error: { kind, message, retryable: opts.retryable ?? defaultRetryable(kind), cause: opts.cause } };
}

const RETRYABLE: ReadonlySet<ChatErrorKind> = new Set<ChatErrorKind>([
  'unreachable', 'unavailable', 'not-a-member', 'join-inviter-unreachable', 'invitation-not-ready', 'join-host-busy',
]);

export function defaultRetryable(kind: ChatErrorKind): boolean {
  return RETRYABLE.has(kind);
}
