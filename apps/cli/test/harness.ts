/**
 * Scenario harness: real serchat processes (the built `dist/serchat.js`, run exactly as a
 * user runs it), each its own profile in a temporary home, meeting through a relay this
 * process starts on loopback. Separate processes are the point: a restart is a real
 * restart, and one party's event loop never slows the other's.
 *
 * Commands run one-shot with `--json`, so results are parsed rows. Long-running commands
 * (`tail`, `idle`) run in the background and are stopped with SIGINT, as Ctrl-C would.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLibp2p, type Libp2p } from 'libp2p';
import { webSockets } from '@libp2p/websockets';
import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { identify } from '@libp2p/identify';
import { circuitRelayServer } from '@libp2p/circuit-relay-v2';

const SERCHAT = fileURLToPath(new URL('../dist/serchat.js', import.meta.url));
/** One-shot runs give the node this long to reserve its relay and open its strands. */
const WAIT_SECONDS = Number(process.env.SCENARIO_WAIT_S ?? 45);
/** Extra serchat options for every run, e.g. `SCENARIO_ARGS='--bg-found -v'`. */
const EXTRA_ARGS = (process.env.SCENARIO_ARGS ?? '').split(/\s+/).filter(Boolean);

export type Row = Record<string, unknown>;

export interface RunResult {
  code: number;
  rows: Row[];
  stdout: string;
  stderr: string;
}

/** A relay on loopback WebSockets, as the phones' relay runs (unlimited relayed streams). */
export async function startRelay(): Promise<{ addr: string; stop(): Promise<void> }> {
  const relay: Libp2p = await createLibp2p({
    addresses: { listen: ['/ip4/127.0.0.1/tcp/0/ws'] },
    transports: [webSockets()],
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()],
    connectionGater: { denyDialMultiaddr: () => false },
    services: {
      identify: identify(),
      relay: circuitRelayServer({ reservations: { applyDefaultLimit: false } }),
    },
  });
  const addr = relay.getMultiaddrs().map(a => a.toString()).find(a => a.includes('/ws'));
  if (!addr) throw new Error('relay has no WebSocket address');
  return { addr, stop: async () => { await relay.stop(); } };
}

/** A temporary serchat home shared by the people of one scenario; removed afterwards. */
export async function scenarioHome(): Promise<{ dir: string; remove(): Promise<void> }> {
  const dir = await mkdtemp(join(tmpdir(), 'serchat-scenario-'));
  return { dir, remove: () => rm(dir, { recursive: true, force: true }) };
}

/** Every background command started and not yet stopped, so a failed test cannot leak one. */
const running = new Set<Background>();

/** Stop whatever a test left running (call from `afterEach`). */
export async function stopAllBackground(): Promise<void> {
  await Promise.all([...running].map(b => b.stop()));
}

/** A running background command (`tail`, `idle`): its rows so far, and a way to stop it. */
export class Background {
  rows: Row[] = [];
  stderr = '';
  private buffer = '';
  readonly exited: Promise<number>;

  constructor(private readonly child: ChildProcess) {
    child.stdout!.setEncoding('utf8').on('data', (chunk: string) => {
      this.buffer += chunk;
      let nl: number;
      while ((nl = this.buffer.indexOf('\n')) >= 0) {
        const line = this.buffer.slice(0, nl);
        this.buffer = this.buffer.slice(nl + 1);
        if (line.trim()) this.rows.push(JSON.parse(line) as Row);
      }
    });
    child.stderr!.setEncoding('utf8').on('data', (chunk: string) => { this.stderr += chunk; });
    this.exited = new Promise(resolve => child.on('exit', code => { running.delete(this); resolve(code ?? -1); }));
    running.add(this);
  }

  /** Resolve once `test` holds for some row, or fail after `ms`. */
  async waitForRow(test: (row: Row) => boolean, what: string, ms = 120_000): Promise<Row> {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
      const hit = this.rows.find(test);
      if (hit) return hit;
      await new Promise(r => setTimeout(r, 250));
    }
    throw new Error(`timed out after ${ms} ms waiting for ${what}; stderr:\n${this.stderr}`);
  }

  /** Resolve once stderr contains `text` (e.g. "following", "idle;"). */
  async waitForNote(text: string, ms = 120_000): Promise<void> {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline && !this.stderr.includes(text)) await new Promise(r => setTimeout(r, 250));
    if (!this.stderr.includes(text)) throw new Error(`timed out waiting for "${text}"; stderr:\n${this.stderr}`);
  }

  /** Ctrl-C, and wait for the process to finish its shutdown (it saves state on the way). */
  async stop(): Promise<number> {
    if (this.child.exitCode === null) this.child.kill('SIGINT');
    return this.exited;
  }
}

/** One person: a serchat profile in the scenario's home. */
export class Person {
  constructor(readonly name: string, private readonly home: string) {}

  private args(words: string[]): string[] {
    return [SERCHAT, '--home', this.home, '-p', this.name, '--json', '--wait', String(WAIT_SECONDS), ...EXTRA_ARGS, ...words];
  }

  /** Run commands one-shot (`;` separates commands, as on the shell) and parse the rows. */
  run(...words: string[]): Promise<RunResult> {
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, this.args(words), { stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      child.stdout.setEncoding('utf8').on('data', (c: string) => { stdout += c; });
      child.stderr.setEncoding('utf8').on('data', (c: string) => { stderr += c; });
      child.on('error', reject);
      child.on('exit', code => {
        const rows = stdout.split('\n').filter(l => l.trim()).map(l => JSON.parse(l) as Row);
        resolve({ code: code ?? -1, rows, stdout, stderr });
      });
    });
  }

  /** Run, and fail the test with serchat's own words unless it exits 0. */
  async ok(...words: string[]): Promise<Row[]> {
    const result = await this.run(...words);
    if (result.code !== 0) throw new Error(`${this.name}: serchat ${words.join(' ')} exited ${result.code}:\n${result.stderr}`);
    return result.rows;
  }

  /** Start a long-running command in the background. */
  start(...words: string[]): Background {
    return new Background(spawn(process.execPath, this.args(words), { stdio: ['ignore', 'pipe', 'pipe'] }));
  }

  /** Name and relay: what every person needs before anything else. */
  async setUp(relay: string): Promise<void> {
    await this.ok('profile', 'set', `name=${this.name}`, ';', 'relay', 'add', relay);
  }
}
