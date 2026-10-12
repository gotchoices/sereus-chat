import type { Result } from '@chat/core';
/**
 * The value of a model result, or a thrown `Error` with the model's message, `kind` and
 * `retryable` — for screens whose error handling is a try/catch around one call.
 */
export function orThrow<T>(result: Result<T>): T {
  if (result.ok) return result.value;
  throw Object.assign(new Error(result.error.message), { kind: result.error.kind, retryable: result.error.retryable, cause: result.error.cause });
}
