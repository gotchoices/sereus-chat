/**
 * Small async utilities for the cadre layer.
 *
 * These exist mainly to keep control-network operations — which block
 * indefinitely on a solo node with no cohort (the control DB uses optimystic's
 * `network` transactor) — from hanging a caller forever.
 */

/**
 * How long to wait for authority genesis before giving up for this session.
 * On a solo node the underlying control-DB read never returns; this only bounds
 * the background attempt and never affects boot (boot never awaits genesis).
 */
export const AUTHORITY_GENESIS_TIMEOUT_MS = 20_000;

/** How long to wait on a one-off control-network operation before failing fast. */
export const CONTROL_OP_TIMEOUT_MS = 15_000;

/**
 * Shorter cap for control-DB reads that back UI (e.g. the CadreManager device
 * list).  Solo, these reads never return; we want the screen to render its
 * actions promptly rather than spin, so the read is best-effort.
 */
export const CONTROL_READ_UI_TIMEOUT_MS = 6_000;

/**
 * Reject with a clear error if `p` hasn't settled within `ms`.  The underlying
 * promise is left to settle on its own (we can't cancel it); this just stops
 * the caller from awaiting a control op that never acknowledges.
 */
export function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms}ms`)),
      ms,
    );
    p.then(
      value => {
        clearTimeout(timer);
        resolve(value);
      },
      err => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}
