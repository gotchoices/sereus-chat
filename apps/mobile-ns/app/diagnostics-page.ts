/**
 * One screen: the core's diagnostics (`@chat/core/diagnostics`), started by buttons, with
 * results on screen and in the log as one `[diag] <name> <json>` line each, for scripts
 * (`adb logcat | grep '\[diag\]'`). The same checks run in Node and in the RN app.
 */
import { Observable, type EventData, type Page } from '@nativescript/core';
import { runCryptoCost, runFoundStrandCheck, runTwoPartyCheck } from '@chat/core/diagnostics';
import { createExtraNode, foundStrandPlatform } from '../src/platform';

const DEFAULT_RELAY = '/dns4/relay.sereus.org/tcp/4011/ws/p2p/12D3KooWMD7E7UH4rkCqiFE69n7FNqrKo1Xx3yDUU8JvwtaH39bD';

class DiagnosticsModel extends Observable {
  relay = DEFAULT_RELAY;
  busy = false;
  status = 'Ready.';
  output = '';

  private async run(name: string, check: (say: (line: string) => void) => Promise<unknown>, summarize: (r: never) => string): Promise<void> {
    this.set('busy', true);
    this.set('status', `Running ${name}…`);
    this.set('output', '');
    const lines: string[] = [];
    const say = (line: string) => { lines.push(line); this.set('output', lines.slice(-30).join('\n')); };
    const t0 = Date.now();
    try {
      const result = await check(say);
      const summary = summarize(result as never);
      this.set('status', `${name}: ${summary} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
      console.log(`[diag] ${name} ${JSON.stringify(result)}`);
    } catch (err) {
      const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      this.set('status', `${name} failed: ${message}`);
      console.log(`[diag] ${name} ${JSON.stringify({ error: message })}`);
    } finally {
      this.set('busy', false);
    }
  }

  runCrypto = () => this.run('crypto', say => runCryptoCost(say),
    (r: { measurements: Array<{ label: string; msPerOp: number }> }) =>
      r.measurements.map(m => `${m.label} ${m.msPerOp.toFixed(3)} ms`).join('; '));

  runFound = () => this.run('found', async say => runFoundStrandCheck(await foundStrandPlatform(), { timeoutMs: 120_000, onProgress: say }),
    (r: { converged: boolean; detail: string }) => r.detail);

  runTwoParty = () => this.run('two-party', say => runTwoPartyCheck({ createNode: createExtraNode, relayAddrs: [this.relay.trim()] }, { timeoutMs: 180_000, onProgress: say }),
    (r: { ok: boolean; detail: string }) => r.detail);
}

export function onNavigatingTo(args: EventData) {
  const page = args.object as Page;
  page.bindingContext ??= new DiagnosticsModel();
}
