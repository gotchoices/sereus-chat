/**
 * dev-bridge.ts — installs the core's development bridge (`@chat/core/diagnostics`) as
 * `globalThis.__chatDev`, in development builds only. The `test/devices` tools reach it
 * over Metro's inspector; serchat installs the same bridge, so one script drives both.
 *
 * Adds `diagnose(name)` for this phone: the core's checks with the phone's platform pieces —
 *   crypto      primitive costs (pure JS and WebCrypto Ed25519)
 *   found       found one strand on one node over rn-leveldb
 *   two-party   two relay-only parties in this process (stops the app's node meanwhile)
 * and `noise([mode])`: the Noise crypto mode (`off` | `symmetric` | `full`), set first when
 * given — the node rebuilds with it — for A/B runs.
 */
import { createDevBridge, runCryptoCost } from '@chat/core/diagnostics';
import { chatModel } from '../data/model';
import { chatHost } from '../host/chat-host';
import { USE_SEREUS } from '../data/config';
import { runFoundStrandCheck } from './found-strand-check';
import { runTwoPartyCheck } from './two-party-check';
import { cadreService } from '../host/CadreService';

const DIAGNOSES = {
  crypto: () => runCryptoCost(),
  found: () => runFoundStrandCheck({ timeoutMs: 120_000 }),
  'two-party': () => runTwoPartyCheck({ timeoutMs: 180_000 }),
} as const;

export function installDevBridge(): void {
  if (!__DEV__) return;
  const bridge = createDevBridge(chatModel, USE_SEREUS ? chatHost.node : undefined);
  const diagnose = (name: keyof typeof DIAGNOSES) => {
    const run = DIAGNOSES[name];
    if (!run) throw new Error(`no diagnosis "${String(name)}"; one of ${Object.keys(DIAGNOSES).join(', ')}`);
    return run();
  };
  const noise = async (mode?: Parameters<typeof cadreService.setNoiseCryptoMode>[0]) => {
    if (mode) await cadreService.setNoiseCryptoMode(mode);
    return cadreService.noiseCryptoMode;
  };
  (globalThis as unknown as { __chatDev: unknown }).__chatDev = Object.assign(bridge, { diagnose, noise });
}
