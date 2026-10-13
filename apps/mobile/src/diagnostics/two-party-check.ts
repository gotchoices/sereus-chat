/**
 * The two-party check on this phone: `@chat/core/diagnostics`' `runTwoPartyCheck`, with
 * both parties built by the host (`createExtraNode`, rn-leveldb under `diag2-`) and the
 * app's own node stopped for the duration. Node runs the same check in the core's tests;
 * a pass there and a failure here points at this runtime.
 */
import { runTwoPartyCheck as runShared, type TwoPartyOptions, type TwoPartyResult } from '@chat/core/diagnostics';
import { orThrow } from '../data/or-throw';
import { chatModel } from '../data/model';
import { chatHost } from '../host/chat-host';
import { cadreService } from '../host/CadreService';

export type { TwoPartyOptions, TwoPartyResult };

export async function runTwoPartyCheck(opts: TwoPartyOptions = {}): Promise<TwoPartyResult> {
  const { relayAddrs } = orThrow(await chatModel.prefs.get());
  return runShared({
    createNode: chatHost.createExtraNode!,
    relayAddrs,
    async pauseApp() {
      await cadreService.stop();
      return () => cadreService.ensureStarted();
    },
  }, { ...opts, onProgress: line => { console.info('[two-party]', line); opts.onProgress?.(line); } });
}
