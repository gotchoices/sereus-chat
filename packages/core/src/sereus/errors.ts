/**
 * Errors inside the Sereus model, and how they leave it.
 *
 * Inside, code throws: the stack does, and a failure deep in a call chain is simplest
 * carried that way. A failure this model recognises is thrown as a `ChatFailure`
 * carrying its `ChatError`. At the boundary every operation runs through `attempt`,
 * which turns a throw into a failed `Result`: a `ChatFailure` keeps its kind, anything
 * else is classified (`unavailable` for the stack's timeouts and quorum failures,
 * `unexpected` otherwise).
 */
import {
  FormationPostApprovalError,
  FormationRejectedError,
  FormationUnreachableError,
} from '@serfab/cadre-core';
import type { ChatError, ChatErrorKind, Result } from '../model/index.js';
import { defaultRetryable, ok } from '../model/index.js';

export class ChatFailure extends Error {
  readonly chatError: ChatError;
  constructor(kind: ChatErrorKind, message: string, opts: { retryable?: boolean; cause?: unknown } = {}) {
    super(message);
    this.name = 'ChatFailure';
    this.chatError = { kind, message, retryable: opts.retryable ?? defaultRetryable(kind), cause: opts.cause };
    Object.setPrototypeOf(this, ChatFailure.prototype);
  }
}

/** Errors the stack raises when a peer, the cohort or the network did not answer in time. */
const UNAVAILABLE = /timed out|super-majority|SyncRetryExhausted|Awaiting.?First.?Sync|not reachable|no peers|database not available|abort/i;

export function toChatError(err: unknown): ChatError {
  if (err instanceof ChatFailure) return err.chatError;
  const message = err instanceof Error ? err.message : String(err);
  const name = err instanceof Error ? err.name : '';
  const kind: ChatErrorKind = UNAVAILABLE.test(`${name} ${message}`) ? 'unavailable' : 'unexpected';
  return { kind, message, retryable: defaultRetryable(kind), cause: err };
}

/** Run one model operation: its value, or its failure as a `Result`. Never throws. */
export async function attempt<T>(operation: () => Promise<T>): Promise<Result<T>> {
  try {
    return ok(await operation());
  } catch (err) {
    return { ok: false, error: toChatError(err) };
  }
}

/**
 * A join failure in words the person can act on. Since sereus 1.10 `formStrand` throws
 * typed errors: `FormationRejectedError` with a fixed `code` and a `retryable` flag when
 * the inviter answered no, and `FormationUnreachableError` when nothing answered.
 */
export function explainJoinFailure(err: unknown): Error {
  const as = (kind: ChatErrorKind, message: string, retryable?: boolean) =>
    new ChatFailure(kind, message, { retryable, cause: err });
  if (err instanceof FormationUnreachableError) {
    return as('join-inviter-unreachable', 'Could not reach the person who invited you. Their app may be closed or offline — try again when they are back.');
  }
  if (err instanceof FormationRejectedError) {
    switch (err.code) {
      case 'token-spent':
        return as('invitation-spent', 'This invitation has already been used or has expired. Ask for a new one.');
      case 'token-unknown':
        return as('invitation-not-ready', 'The invitation is not ready on their side yet. Try again in a moment.');
      case 'approval-refused':
        return as('join-refused', 'The person who invited you did not let this join go through.');
      case 'busy':
      case 'provisioning-timeout':
      case 'host-strand-unavailable':
      case 'approval-unavailable':
        return as('join-host-busy', 'Their side could not finish this join just now. Try again in a moment.');
      case 'host-strand-must-be-recreated':
        return as('join-host-outdated', 'This conversation was made with an older version and cannot take new members. Ask for a new invitation.');
      default:
        return err.retryable
          ? as('join-host-busy', 'The join did not go through this time. Try again in a moment.', true)
          : as('invitation-unusable', 'This invitation cannot be used. Ask for a new one.');
    }
  }
  if (err instanceof FormationPostApprovalError) {
    return as('join-incomplete', 'You were let in, but this phone could not finish setting up the conversation. Ask for a new invitation.');
  }
  return err instanceof Error ? err : new Error(String(err));
}

/** Reject with a clear error if `p` has not settled within `ms`. `p` is left to settle. */
export function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    p.then(
      value => { clearTimeout(timer); resolve(value); },
      err => { clearTimeout(timer); reject(err); },
    );
  });
}
