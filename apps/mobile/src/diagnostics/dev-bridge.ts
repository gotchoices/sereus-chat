/**
 * dev-bridge.ts — installs the core's development bridge (`@chat/core/diagnostics`) as
 * `globalThis.__chatDev`, in development builds only. The `test/devices` tools reach it
 * over Metro's inspector; serchat installs the same bridge, so one script drives both.
 */
import { createDevBridge } from '@chat/core/diagnostics';
import { chatModel } from '../data/model';
import { chatHost } from '../host/chat-host';
import { USE_SEREUS } from '../data/config';

export function installDevBridge(): void {
  if (!__DEV__) return;
  (globalThis as unknown as { __chatDev: unknown }).__chatDev = createDevBridge(chatModel, USE_SEREUS ? chatHost.node : undefined);
}
