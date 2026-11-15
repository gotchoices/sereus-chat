/**
 * Two transient members, the case a new pair of chat users is in: no DHT to speak of, each
 * device often away. A transfer cut off mid-way resumes where it stopped; a file put while
 * alone waits in the outbox and is offered when a member connects; and after both go away and
 * come back together (the sender restarted from its saved index), the file still crosses.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { randomBytes, createHash } from 'node:crypto';
import { createLibp2p, type Libp2p } from 'libp2p';
import { webSockets } from '@libp2p/websockets';
import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { identify } from '@libp2p/identify';
import { StrandFiles, NotAvailableError, MemoryBlockStore, type Libp2pLike } from './index.js';

const nodes: Libp2p[] = [];
async function node(): Promise<Libp2p> {
  const n = await createLibp2p({
    addresses: { listen: ['/ip4/127.0.0.1/tcp/0/ws'] },
    transports: [webSockets()], connectionEncrypters: [noise()], streamMuxers: [yamux()],
    connectionGater: { denyDialMultiaddr: () => false },
    services: { identify: identify() },
  });
  nodes.push(n);
  return n;
}
afterEach(async () => { await Promise.allSettled(nodes.splice(0).map(n => n.stop())); });
const lite = (n: Libp2p) => n as unknown as Libp2pLike;
async function* once(bytes: Uint8Array) { yield bytes; }
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
async function until(check: () => Promise<boolean> | boolean, what: string, ms = 20_000): Promise<void> {
  for (const end = Date.now() + ms; Date.now() < end;) { if (await check()) return; await new Promise(r => setTimeout(r, 100)); }
  throw new Error(`timed out waiting for ${what}`);
}
async function bytesOf(f: StrandFiles, scope: string, cid: string): Promise<Uint8Array> {
  const parts: Uint8Array[] = [];
  for await (const p of f.read(scope, cid)) parts.push(p);
  return new Uint8Array(Buffer.concat(parts));
}

/** A block store that serves slowly and counts what it serves (chunks only). */
class SlowStore extends MemoryBlockStore {
  served = 0;
  constructor(private readonly delayMs: number) { super(); }
  override async get(key: string) {
    const b = await super.get(key);
    if (b && !key.startsWith('_') && b.length > 10_000) { this.served++; await new Promise(r => setTimeout(r, this.delayMs)); }
    return b;
  }
}

describe('two transient members', () => {
  it('a transfer cut off mid-way resumes where it stopped', async () => {
    const store = new SlowStore(250);
    const fa = new StrandFiles({ blocks: store, perRequest: 1, parallel: 1 });
    const fb = new StrandFiles({ blocks: new MemoryBlockStore() });
    const bytes = new Uint8Array(randomBytes(8 * 262_144));
    const { cid } = await fa.put('s1', once(bytes));
    const [a, b] = await Promise.all([node(), node()]);
    await fa.serve('s1', lite(a)); await fb.serve('s1', lite(b));
    await b.dial(a.getMultiaddrs()[0]);

    // A goes away after a few chunks have crossed.
    const fetching = fb.fetch('s1', cid).catch((e: unknown) => e);
    await until(() => store.served >= 3, 'three chunks served');
    await a.stop();
    const err = await fetching;
    expect(err).toBeInstanceOf(NotAvailableError);
    const got = (err as NotAvailableError).have;
    expect(got).toBeGreaterThanOrEqual(2);
    expect(got).toBeLessThan(8);

    // A comes back (a new node, the same blocks); B asks only for the rest.
    const a2 = await node();
    await fa.serve('s1', lite(a2));
    await b.dial(a2.getMultiaddrs()[0]);
    const report = await fb.fetch('s1', cid);
    expect(report.chunks).toBe(8 - got);
    expect(sha(await bytesOf(fb, 's1', cid))).toBe(sha(bytes));
  }, 60_000);

  it('a file put while alone waits in the outbox, and is placed when a member connects', async () => {
    const placed: string[] = [];
    const fa = new StrandFiles({ blocks: new MemoryBlockStore(), onPlaced: (_s, cid) => placed.push(cid) });
    const fb = new StrandFiles({ blocks: new MemoryBlockStore(), onAnnounce: () => 10_000_000 });
    const a = await node();
    await fa.serve('s1', lite(a));
    const bytes = new Uint8Array(randomBytes(700_000));
    const { cid } = await fa.put('s1', once(bytes));
    expect(await fa.announce('s1', cid)).toBe(0);
    expect(fa.outbox('s1')).toEqual([cid]);
    expect((await fa.status(cid))?.placed).toBe(false);

    const b = await node();
    await fb.serve('s1', lite(b));
    await b.dial(a.getMultiaddrs()[0]);
    await until(() => fb.has(cid), 'the file at B');
    expect(sha(await bytesOf(fb, 's1', cid))).toBe(sha(bytes));
    await until(() => placed.includes(cid), 'A told the file is placed');
    expect(fa.outbox('s1')).toEqual([]);
    expect((await fa.status(cid))?.heldBy).toEqual([b.peerId.toString()]);
  }, 60_000);

  it('both go away and come back together: the file still crosses', async () => {
    const storeA = new MemoryBlockStore();
    let fa = new StrandFiles({ blocks: storeA });
    const fb = new StrandFiles({ blocks: new MemoryBlockStore(), onAnnounce: () => 10_000_000 });
    let a = await node();
    await fa.serve('s1', lite(a));
    const bytes = new Uint8Array(randomBytes(900_000));
    const { cid } = await fa.put('s1', once(bytes));   // B is away: announced to nobody
    await a.stop();                                     // and now A is away too

    // Both come back at the same moment; A's app restarted (a new instance, its saved index).
    const placed: string[] = [];
    fa = new StrandFiles({ blocks: storeA, onPlaced: (_s, c) => placed.push(c) });
    const [a2, b] = await Promise.all([node(), node()]);
    a = a2;
    await Promise.all([fa.serve('s1', lite(a)), fb.serve('s1', lite(b))]);
    await b.dial(a.getMultiaddrs()[0]);
    await until(() => fb.has(cid), 'the file at B');
    expect(sha(await bytesOf(fb, 's1', cid))).toBe(sha(bytes));
    await until(() => placed.includes(cid), 'A told the file is placed');
  }, 60_000);
});
