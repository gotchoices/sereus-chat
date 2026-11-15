/**
 * bench.ts — the floor: how fast bytes move between two members over the strand's own
 * connections, with no database involved. One libp2p stream, the bytes, an acknowledgement.
 * Compared with what an attachment costs end to end (`[perf]`, `[blob]`), the difference is
 * what the shared database adds (docs/STATUS.md, "Where the time goes").
 *
 * Every strand node answers `BENCH_PROTOCOL` once {@link ensureBenchHandler} has seen it. The
 * request is an 8-byte header — direction (0: I send you `size` bytes; 1: you send me `size`
 * bytes) and size — then, for direction 0, the bytes. The side that received the bytes answers
 * with a 4-byte "done" once it has all of them. Diagnostics only: the handler accepts at most
 * {@link MAX_BENCH_BYTES} and answers only peers the strand node is connected to.
 */
import type { StrandInstance } from '@serfab/cadre-core';

export const BENCH_PROTOCOL = '/chat/bench/1.0.0';
const MAX_BENCH_BYTES = 16 * 1024 * 1024;
const PIECE = 64 * 1024;

type Bytes = Uint8Array;
type Chunk = Bytes | { subarray(): Bytes };
interface BenchStream extends AsyncIterable<Chunk> {
  send(data: Bytes): boolean;
  onDrain(options?: { signal?: AbortSignal }): Promise<void>;
  close(): Promise<void>;
  abort(err: Error): void;
}
interface BenchNode {
  handle(protocol: string, handler: (stream: BenchStream) => void | Promise<void>, options?: { runOnLimitedConnection?: boolean }): Promise<void>;
  dialProtocol(peer: unknown, protocol: string, options?: { signal?: AbortSignal; runOnLimitedConnection?: boolean }): Promise<BenchStream>;
  getConnections(): Array<{ remotePeer: { toString(): string }; remoteAddr: { toString(): string } }>;
}

const toBytes = (c: Chunk): Bytes => (c instanceof Uint8Array ? c : c.subarray());
const handled = new WeakSet<object>();

/** Read exactly `n` bytes from `it` (a stream's iterator), returning any bytes beyond them. */
async function readExactly(it: AsyncIterator<Chunk>, n: number, have: Bytes[] = []): Promise<{ head: Bytes; rest: Bytes | null }> {
  let total = have.reduce((a, b) => a + b.length, 0);
  const parts = [...have];
  while (total < n) {
    const next = await it.next();
    if (next.done) throw new Error(`stream ended after ${total} of ${n} bytes`);
    const b = toBytes(next.value);
    parts.push(b);
    total += b.length;
  }
  const all = new Uint8Array(total);
  let at = 0;
  for (const p of parts) { all.set(p, at); at += p.length; }
  return { head: all.subarray(0, n), rest: total > n ? all.subarray(n) : null };
}

/** Count `n` bytes off `it` without keeping them (`already` were read with the header). */
async function drain(it: AsyncIterator<Chunk>, n: number, already: number): Promise<void> {
  let got = already;
  while (got < n) {
    const next = await it.next();
    if (next.done) throw new Error(`stream ended after ${got} of ${n} bytes`);
    got += toBytes(next.value).length;
  }
}

async function sendBytes(stream: BenchStream, n: number, signal?: AbortSignal): Promise<void> {
  const piece = new Uint8Array(PIECE);
  for (let sent = 0; sent < n; sent += PIECE) {
    const part = n - sent < PIECE ? piece.subarray(0, n - sent) : piece;
    if (!stream.send(part)) await stream.onDrain({ signal });
  }
}

const header = (direction: 0 | 1, size: number): Bytes => {
  const h = new Uint8Array(8);
  const v = new DataView(h.buffer);
  v.setUint8(0, direction);
  v.setUint32(4, size, false);
  return h;
};
const DONE = new Uint8Array([0x64, 0x6f, 0x6e, 0x65]);   // "done"

/** Answer {@link BENCH_PROTOCOL} on this strand's node (idempotent; call again after a wake). */
export async function ensureBenchHandler(strand: StrandInstance): Promise<void> {
  const node = strand.libp2pNode as unknown as BenchNode | undefined;
  if (!node || handled.has(node)) return;
  handled.add(node);
  await node.handle(BENCH_PROTOCOL, async (stream) => {
    const it = stream[Symbol.asyncIterator]();
    try {
      const { head, rest } = await readExactly(it, 8);
      const v = new DataView(head.buffer, head.byteOffset, 8);
      const direction = v.getUint8(0);
      const size = v.getUint32(4, false);
      if (size > MAX_BENCH_BYTES) throw new Error(`bench size ${size} over the limit`);
      const t0 = Date.now();
      if (direction === 0) {
        await drain(it, size, rest?.length ?? 0);
        stream.send(DONE);
      } else {
        await sendBytes(stream, size);
        await readExactly(it, DONE.length, rest ? [rest] : []);
      }
      console.info(`[bench] answered: ${direction === 0 ? 'received' : 'sent'} ${size} bytes in ${Date.now() - t0} ms`);
      await stream.close();
    } catch (err) {
      console.warn('[bench] answering failed:', err instanceof Error ? `${err.name}: ${err.message}` : String(err));
      stream.abort(err instanceof Error ? err : new Error(String(err)));
    }
  }, { runOnLimitedConnection: true }).catch((err: unknown) => {
    handled.delete(node);
    throw err;
  });
}

export interface BenchResult {
  peer: string;
  /** How the bytes went: `direct webrtc`, `relayed`, or `direct` (another transport). */
  path: string;
  direction: 'send' | 'receive';
  bytes: number;
  ms: number;
  /** Megabytes (10^6) per second. */
  mbPerSecond: number;
}

/**
 * Time `bytes` each way between this member and every peer the strand node is connected to
 * that answers the protocol (the relay does not, and is skipped).
 */
export async function benchStrand(strand: StrandInstance, bytes: number, timeoutMs = 120_000): Promise<BenchResult[]> {
  await ensureBenchHandler(strand);
  const node = strand.libp2pNode as unknown as BenchNode | undefined;
  if (!node) throw new Error(`Strand ${strand.strandId} has no network node up`);
  const peers = new Map<string, { peer: unknown; path: string }>();
  for (const c of node.getConnections()) {
    const addr = c.remoteAddr.toString();
    const path = addr.includes('/webrtc') ? 'direct webrtc' : addr.includes('/p2p-circuit') ? 'relayed' : 'direct';
    const id = c.remotePeer.toString();
    // The best path a peer has: a direct one over a relayed one.
    if (!peers.has(id) || peers.get(id)!.path === 'relayed') peers.set(id, { peer: c.remotePeer, path });
  }
  const results: BenchResult[] = [];
  for (const [id, { peer, path }] of peers) {
    for (const direction of [0, 1] as const) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(new Error(`bench timed out after ${timeoutMs} ms`)), timeoutMs);
      const signal = controller.signal;
      let stream: BenchStream;
      try {
        stream = await node.dialProtocol(peer, BENCH_PROTOCOL, { signal, runOnLimitedConnection: true });
      } catch {
        clearTimeout(timer);
        break;   // not a member's node (the relay), or not answering: skip it
      }
      const t0 = Date.now();
      try {
        stream.send(header(direction, bytes));
        const it = stream[Symbol.asyncIterator]();
        if (direction === 0) {
          await sendBytes(stream, bytes, signal);
          await readExactly(it, DONE.length);
        } else {
          await drain(it, bytes, 0);
          stream.send(DONE);
        }
        const ms = Math.max(1, Date.now() - t0);
        results.push({ peer: id, path, direction: direction === 0 ? 'send' : 'receive', bytes, ms, mbPerSecond: Number((bytes / 1e6 / (ms / 1000)).toFixed(2)) });
        await stream.close().catch(() => {});
      } catch (err) {
        stream.abort(err instanceof Error ? err : new Error(String(err)));
        throw err;
      } finally {
        clearTimeout(timer);
      }
    }
  }
  return results;
}
