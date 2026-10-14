/**
 * The one ChatModel (the core's Sereus model over this app's host) and the strings,
 * shared by every screen. `boot()` starts the node and re-attaches strands; screens bind
 * to core stores over `model`.
 */
import { createSereusModel } from '@chat/core/sereus';
import { createDevBridge, runCryptoCost } from '@chat/core/diagnostics';
import { runBridgeCost, runSqliteCost } from './bridge-cost';
import { createTranslator } from '@chat/resources';
import { chatHost } from './host';

const sereus = createSereusModel(chatHost);
export const model = sereus.model;
export const t = createTranslator('en');

declare const __DEV__: boolean;
// Debug builds: the core's dev bridge, for test/devices tools over the NativeScript
// inspector (`ns debug android --start`), as serchat's is over Node's.
if (__DEV__) {
  (globalThis as { __chatDev?: unknown }).__chatDev = createDevBridge(model, chatHost.node);
  // The diagnostics screen's benchmarks, callable over the inspector (no UI automation).
  (globalThis as { __chatDiag?: unknown }).__chatDiag = { crypto: () => runCryptoCost(() => {}), bridge: runBridgeCost, sqlite: runSqliteCost };
}

let booting: Promise<void> | null = null;
export function boot(): Promise<void> {
  booting ??= sereus.boot().catch(err => { console.warn('[model] boot failed:', err); booting = null; throw err; });
  return booting;
}

/** An invitation token that arrived by link before a screen could show it. */
export let pendingInvitation: string | null = null;
export function setPendingInvitation(token: string | null): void { pendingInvitation = token; }
