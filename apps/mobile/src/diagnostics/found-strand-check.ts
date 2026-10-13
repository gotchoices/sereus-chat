/**
 * The found-strand check on this phone: `@chat/core/diagnostics`' `runFoundStrandCheck`
 * over the host's diagnostic storage (rn-leveldb under a `diag-` prefix). Node runs the same
 * function over classic-level (`test/stack/found-strand.mjs`); the results differ only in
 * the runtime and the native storage.
 */
import { runFoundStrandCheck as runShared, type FoundStrandOptions, type FoundStrandResult } from '@chat/core/diagnostics';
import { foundStrandPlatform } from '../host/extra-node';

export type CheckOptions = FoundStrandOptions;
export type CheckResult = FoundStrandResult;

export async function runFoundStrandCheck(opts: CheckOptions = {}): Promise<CheckResult> {
  return runShared(await foundStrandPlatform(), {
    ...opts,
    onProgress: line => { console.info('[stack-check]', line); opts.onProgress?.(line); },
  });
}
