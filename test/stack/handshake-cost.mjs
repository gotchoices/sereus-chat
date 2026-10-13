/**
 * The Node half of the crypto-cost measurement. The phone runs the same code
 * (`@chat/core/diagnostics`, from its Diagnostics screen), so the two sets of figures
 * differ only in the runtime. Absolute numbers are not the point; the ratio is.
 *
 * Usage:  node handshake-cost.mjs
 */
import { runCryptoCost } from '@chat/core/diagnostics';

const report = await runCryptoCost(line => console.log(`… ${line}`));
for (const m of report.measurements) {
  console.log(`${m.label.padEnd(36)} ${m.msPerOp.toFixed(3).padStart(9)} ms/op  (${m.iterations}x)${m.implication ? `  ${m.implication}` : ''}`);
}
for (const note of report.notes) console.log(note);
