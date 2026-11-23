/**
 * The stack regression suite: every check in `suite.json`, one after another, each against what
 * it is expected to do on this stack. Run it whenever the stack moves (`scripts/use-stack.sh`
 * runs it after `--install`).
 *
 *   node test/stack/run.mjs                 # every check
 *   node test/stack/run.mjs found-strand    # the checks whose name contains this
 *
 * A check is a script here that exits 0 when the stack does what it asks. One marked
 * `expect: "fail"` states behaviour the stack does not have yet, with the issue that tracks it.
 * The run fails when any check does something other than expected, including such a check
 * passing: the stack has changed, so drop the mark and revisit what the app does about it.
 * Checks that need a relay get one on loopback, in this process (`local-relay.mjs`). Each
 * check's output goes to a log file, named in the summary.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, createWriteStream } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startLocalRelay } from './local-relay.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));
const { checks } = JSON.parse(readFileSync(join(here, 'suite.json'), 'utf8'));
const only = process.argv[2];
const chosen = only ? checks.filter(c => c.script.includes(only)) : checks;
const logs = mkdtempSync(join(tmpdir(), 'stack-suite-'));
const DEFAULT_TIMEOUT_S = 300;

function versions() {
  const root = join(here, '../../node_modules');
  const v = name => { try { return JSON.parse(readFileSync(join(root, name, 'package.json'), 'utf8')).version; } catch { return '?'; } };
  return ['@serfab/cadre-core', '@optimystic/db-p2p', '@quereus/quereus', 'p2p-fret'].map(n => `${n} ${v(n)}`).join(', ');
}

/** Run one check: its exit code (or 'timeout') and how long it took. */
function runOne(check, relayAddr) {
  return new Promise(resolve => {
    const log = join(logs, check.script.replace(/\.mjs$/, '.log'));
    const out = createWriteStream(log);
    const t0 = Date.now();
    const child = spawn(process.execPath, [join(here, check.script)], {
      cwd: here,
      env: { ...process.env, ...(check.env ?? {}), ...(relayAddr ? { RELAY_ADDR: relayAddr } : {}) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.pipe(out, { end: false });
    child.stderr.pipe(out, { end: false });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, (check.timeoutS ?? DEFAULT_TIMEOUT_S) * 1000);
    child.on('exit', code => {
      clearTimeout(timer);
      out.end();
      resolve({ code: timedOut ? 'timeout' : code, ms: Date.now() - t0, log });
    });
  });
}

console.log(`stack suite: ${chosen.length} check(s) on ${versions()}\nlogs: ${logs}\n`);
const relay = chosen.some(c => c.relay) ? await startLocalRelay() : null;
const rows = [];
let mismatches = 0;
for (const check of chosen) {
  const { code, ms, log } = await runOne(check, check.relay ? relay.addr : null);
  const got = code === 0 ? 'pass' : 'fail';
  const matches = got === check.expect;
  if (!matches) mismatches++;
  const verdict = matches
    ? (got === 'pass' ? 'ok' : `ok (expected to fail: ${check.issue})`)
    : (got === 'pass' ? `NOW PASSES — ${check.issue} may be fixed: drop the mark` : `FAILED (exit ${code})`);
  const line = `${matches ? '  ' : '✗ '}${check.script.padEnd(38)} ${String(Math.round(ms / 1000)).padStart(4)} s  ${verdict}`;
  console.log(line);
  rows.push({ ...check, got, code, ms, log });
}
await relay?.stop();
console.log(`\n${mismatches ? `${mismatches} check(s) did not do what was expected` : 'every check did what was expected'}`);
for (const r of rows.filter(r => r.got !== r.expect)) console.log(`  ${r.script}: ${r.log}`);
process.exit(mismatches ? 1 : 0);
