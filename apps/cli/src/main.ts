/**
 * serchat — Sereus Chat on the command line, for testing, evaluating and debugging.
 *
 *   serchat [options]                      interactive (stdin is a terminal)
 *   serchat [options] < script             one command per line
 *   serchat [options] <command> [\; ...]   run, then exit
 *   serchat [options] -c 'cmd; cmd'
 *
 * Spec: design/specs/cli/commands.md. Each run starts the profile's node; there is no
 * background process, so a one-shot command pays for the start (seconds).
 */
import { createInterface, type Interface } from 'node:readline';
import { readFile, writeFile } from 'node:fs/promises';
import { format } from 'node:util';
import { createSereusModel } from '@chat/core/sereus';
import { DEFAULT_LISTEN, createCliHost, defaultListenAddress } from './host.js';
import { openProfile, profileDirs } from './home.js';
import { createOutput } from './output.js';
import { splitArgv, splitLine } from './lex.js';
import { EXIT, createSession, type Session } from './session.js';
import { commandNames, runCommands } from './commands/index.js';

declare const SERCHAT_VERSION: string;
const VERSION = typeof SERCHAT_VERSION === 'string' ? SERCHAT_VERSION : 'dev';
const HISTORY_LINES = 1000;

interface Globals {
  profile: string;
  home?: string;
  json: boolean;
  header: boolean;
  relays: string[];
  listen: string[];
  waitSeconds: number;
  verbose: boolean;
  script?: string;
  help: boolean;
  version: boolean;
  /** The words after the options: commands, if any. */
  rest: string[];
}

const USAGE = `usage: serchat [options] [command [args] [\\; command ...]]

  -p, --profile <name>   profile (default "default")
      --home <dir>       where profiles live (default $SERCHAT_HOME or ~/.serchat)
      --json             JSON lines instead of tab-separated lines
      --header           a column header line before tab-separated rows
      --relay <addr>     also use this relay for this run (repeatable)
      --listen [<addr>]  also listen (default: loopback, on this profile's own port)
      --wait <seconds>   one-shot: how long to let strands settle first (default 30)
  -c <commands>          run these ";"-separated commands
  -v, --verbose          network-layer log lines on stderr
  -h, --help · --version

With no command: an interactive prompt, or commands from stdin. "help" lists commands.`;

export function parseGlobals(argv: string[]): Globals {
  const g: Globals = { profile: 'default', json: false, header: false, relays: [], listen: [], waitSeconds: 30, verbose: false, help: false, version: false, rest: [] };
  let i = 0;
  const value = (flag: string) => {
    const v = argv[++i];
    if (v === undefined) throw new Error(`${flag} needs a value`);
    return v;
  };
  for (; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-p' || a === '--profile') g.profile = value(a);
    else if (a === '--home') g.home = value(a);
    else if (a === '--json') g.json = true;
    else if (a === '--header') g.header = true;
    else if (a === '--relay') g.relays.push(value(a));
    else if (a === '--listen') g.listen.push(argv[i + 1]?.startsWith('/') ? argv[++i] : DEFAULT_LISTEN);
    else if (a === '--wait') g.waitSeconds = Number(value(a));
    else if (a === '-c') g.script = value(a);
    else if (a === '-v' || a === '--verbose') g.verbose = true;
    else if (a === '-h' || a === '--help') g.help = true;
    else if (a === '--version') g.version = true;
    else if (a === '--') { i++; break; }
    else if (a.startsWith('-') && a !== '-') throw new Error(`unknown option ${a}`);
    else break;
  }
  g.rest = argv.slice(i);
  if (!Number.isFinite(g.waitSeconds) || g.waitSeconds < 0) throw new Error('--wait takes seconds');
  return g;
}

/**
 * The stack logs freely to the console. stdout is for data, so its console output goes to
 * stderr with -v, and nowhere without.
 */
function routeConsole(verbose: boolean): void {
  const toStderr = (...args: unknown[]) => { process.stderr.write(`${format(...args)}\n`); };
  const quiet = () => {};
  for (const level of ['log', 'info', 'debug', 'warn', 'error'] as const) console[level] = verbose ? toStderr : quiet;
  process.on('unhandledRejection', err => { if (verbose) toStderr('[unhandled]', err); });
}

async function main(argv: string[]): Promise<number> {
  let g: Globals;
  try {
    g = parseGlobals(argv);
  } catch (err) {
    process.stderr.write(`serchat: ${(err as Error).message}\n${USAGE}\n`);
    return EXIT.usage;
  }
  if (g.help) { process.stderr.write(`${USAGE}\n`); return EXIT.ok; }
  if (g.version) { process.stdout.write(`${VERSION}\n`); return EXIT.ok; }

  const commands = g.script !== undefined ? splitLine(g.script) : splitArgv(g.rest);
  const interactive = commands.length === 0 && !!process.stdin.isTTY;
  routeConsole(g.verbose);

  const dirs = profileDirs(g.profile, g.home);
  const { config, created } = await openProfile(dirs);
  const out = createOutput({ json: g.json, header: g.header });
  const listen = await Promise.all(g.listen.map(a => (a === DEFAULT_LISTEN ? defaultListenAddress(dirs, config) : a)));
  const host = createCliHost({ dirs, config, extraRelays: g.relays, listen, dev: g.verbose });
  const { model, boot } = createSereusModel(host);
  out.note(`serchat ${VERSION} · profile ${dirs.name}${created ? ' (new)' : ''} · starting…`);

  let abort = new AbortController();
  let rl: Interface | undefined;
  const ready = boot();
  ready.catch(() => {}); // reported by the first command that waits on it

  const session = createSession({
    model, host, out, dirs, config, verbose: g.verbose, interactive, ready,
    signal: () => abort.signal,
    confirm: question => ask(rl, `${question} [y/N] `).then(a => /^y(es)?$/i.test(a.trim())),
  });

  let code: number = EXIT.ok;
  try {
    if (interactive) {
      void ready.then(() => out.note('ready. "help" or "?" lists the commands.'), err => out.note(`serchat: the node did not start: ${(err as Error).message}`));
      rl = await prompt(session, dirs.historyFile, () => abort, next => { abort = next; });
    } else {
      process.on('SIGINT', () => {
        if (!abort.signal.aborted) abort.abort();
        else void shutdown(session, EXIT.interrupted);
      });
      await ready.catch(() => {});
      await settle(session, g.waitSeconds * 1000);
      const script = commands.length ? commands : splitLine(await readAll());
      code = await runCommands(session, script);
    }
  } finally {
    rl?.close();
  }
  return shutdown(session, code);
}

/**
 * One-shot: give the node a bounded time to get going before the commands run: its relay
 * reservation (when it has relays), and its strands open, so `strands`, `log` and `send`
 * find them. The core's `settling` ends once it has asked the network for its strands; a
 * strand can still be opening (re-attaching, first sync) after that, so this waits for
 * those too.
 */
async function settle(session: Session, ms: number): Promise<void> {
  const deadline = Date.now() + ms;
  const busy = async () => {
    if (await session.model.strands.settling()) return true;
    // With relays named, a run that starts by inviting needs the reservation first.
    const reach = await session.model.reachability.get();
    if (reach.relays.length && !reach.reachable) return true;
    const list = await session.model.strands.list();
    return list.ok && list.value.some(s => s.opening);
  };
  while (Date.now() < deadline && (await busy())) {
    await new Promise(r => setTimeout(r, 500));
  }
}

async function shutdown(session: Session, code: number): Promise<number> {
  // Stopping can hang on a peer that does not answer; the exit does not wait forever.
  await Promise.race([session.host.node.stop().catch(() => {}), new Promise(r => setTimeout(r, 5000).unref())]);
  process.exit(code);
}

async function readAll(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

/** A question on the terminal; '' when nobody is there to answer. */
function ask(rl: Interface | undefined, question: string): Promise<string> {
  if (rl) return new Promise(resolve => rl.question(question, resolve));
  if (!process.stdin.isTTY) return Promise.resolve('');
  const once = createInterface({ input: process.stdin, output: process.stderr });
  return new Promise(resolve => once.question(question, answer => { once.close(); resolve(answer); }));
}

/** The interactive prompt. Resolves with its readline interface once the user leaves. */
async function prompt(
  session: Session,
  historyFile: string,
  currentAbort: () => AbortController,
  setAbort: (next: AbortController) => void,
): Promise<Interface> {
  const saved = await readFile(historyFile, 'utf8').then(t => t.split('\n').filter(Boolean), () => [] as string[]);
  const names = commandNames();
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'serchat> ',
    history: saved.slice(-HISTORY_LINES).reverse(),
    historySize: HISTORY_LINES,
    completer: (line: string) => {
      if (/\s/.test(line)) return [[], line];
      const hits = names.filter(n => n.startsWith(line));
      return [hits.length ? hits : names, line];
    },
  });
  let running = false;
  rl.on('SIGINT', () => {
    if (running) { currentAbort().abort(); return; }
    process.stderr.write('\n(quit or Ctrl-D to leave)\n');
    rl.prompt();
  });
  rl.prompt();
  for await (const line of rl) {
    const trimmed = line.trim();
    if (trimmed === 'quit' || trimmed === 'exit') break;
    if (trimmed) {
      let commands: string[][];
      try {
        commands = splitLine(trimmed);
      } catch (err) {
        session.out.note(`serchat: ${(err as Error).message}`);
        rl.prompt();
        continue;
      }
      running = true;
      setAbort(new AbortController());
      await runCommands(session, commands);
      running = false;
    }
    rl.prompt();
  }
  const history = (rl as unknown as { history: string[] }).history.slice(0, HISTORY_LINES).reverse();
  await writeFile(historyFile, `${history.join('\n')}\n`, { mode: 0o600 }).catch(() => {});
  return rl;
}

main(process.argv.slice(2)).then(
  code => process.exit(code),
  err => {
    process.stderr.write(`serchat: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(EXIT.failed);
  },
);
