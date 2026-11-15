/**
 * The strand file layer over real libp2p nodes on loopback: a file put on A is fetched by B,
 * byte for byte; it is served only in its scope; it spreads (C fetches it from B after A has
 * gone); and leases decide what `gc` keeps.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomBytes, createHash } from 'node:crypto';
import { createLibp2p, type Libp2p } from 'libp2p';
import { webSockets } from '@libp2p/websockets';
import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { identify } from '@libp2p/identify';
import { CID } from 'multiformats/cid';
import { sha256 as mfSha256 } from 'multiformats/hashes/sha2';
import * as raw from 'multiformats/codecs/raw';
import { StrandFiles, NotAvailableError, MemoryBlockStore, cidFor, RAW, type Libp2pLike } from './index.js';

async function node(): Promise<Libp2p> {
  return createLibp2p({
    addresses: { listen: ['/ip4/127.0.0.1/tcp/0/ws'] },
    transports: [webSockets()], connectionEncrypters: [noise()], streamMuxers: [yamux()],
    connectionGater: { denyDialMultiaddr: () => false },
    services: { identify: identify() },
  });
}
const lite = (n: Libp2p) => n as unknown as Libp2pLike;
async function* once(bytes: Uint8Array) { yield bytes; }
async function all(source: AsyncIterable<Uint8Array>): Promise<Uint8Array> {
  const parts: Uint8Array[] = [];
  for await (const p of source) parts.push(p);
  return new Uint8Array(Buffer.concat(parts));
}
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

describe('CIDs', () => {
  it('match multiformats for a raw sha-256 block', async () => {
    const bytes = new Uint8Array(randomBytes(1000));
    const ours = cidFor(RAW, new Uint8Array(createHash('sha256').update(bytes).digest()));
    const theirs = CID.create(1, raw.code, await mfSha256.digest(bytes)).toString();
    expect(ours).toBe(theirs);
  });
});

describe('strand files over libp2p', () => {
  let a: Libp2p, b: Libp2p, c: Libp2p;
  let fa: StrandFiles, fb: StrandFiles, fc: StrandFiles;
  const bytes = new Uint8Array(randomBytes(2_300_123));
  let cid = '';

  beforeAll(async () => {
    [a, b, c] = await Promise.all([node(), node(), node()]);
    fa = new StrandFiles({ blocks: new MemoryBlockStore() });
    fb = new StrandFiles({ blocks: new MemoryBlockStore() });
    fc = new StrandFiles({ blocks: new MemoryBlockStore() });
    await fa.serve('s1', lite(a));
    await fb.serve('s1', lite(b));
    await fc.serve('s1', lite(c));
    await b.dial(a.getMultiaddrs()[0]);
  });
  afterAll(async () => { await Promise.allSettled([a?.stop(), b?.stop(), c?.stop()]); });

  it('puts a file locally and names it by content', async () => {
    const put = await fa.put('s1', once(bytes));
    cid = put.cid;
    expect(put.size).toBe(bytes.length);
    expect(cid).toMatch(/^b[a-z2-7]+$/);
    expect(await fa.has(cid)).toBe(true);
    // The same bytes again: the same id.
    expect((await fa.put('s1', once(bytes))).cid).toBe(cid);
  });

  it('B fetches it from A, identical', async () => {
    expect(await fb.has(cid)).toBe(false);
    const t0 = Date.now();
    const got = await all(fb.read('s1', cid));
    process.stderr.write(`[files test] 2.3 MB fetched over loopback in ${Date.now() - t0} ms\n`);
    expect(sha(got)).toBe(sha(bytes));
    expect(await fb.has(cid)).toBe(true);
  });

  it('serves a file only in its own scope', async () => {
    const other = await fa.put('s2', once(new Uint8Array(randomBytes(10_000))));
    // B asks over its s1 node: A holds the file only for s2.
    await expect(fb.fetch('s1', other.cid)).rejects.toBeInstanceOf(NotAvailableError);
  });

  it('spreads: C fetches it from B after A has gone', async () => {
    await a.stop();
    await c.dial(b.getMultiaddrs()[0]);
    const got = await all(fc.read('s1', cid));
    expect(sha(got)).toBe(sha(bytes));
  });

  it('reports a file nobody reachable has', async () => {
    const lonely = new StrandFiles({ blocks: new MemoryBlockStore() });
    const n = await node();
    try {
      await lonely.serve('s1', lite(n));
      const err = await lonely.fetch('s1', cid).catch(e => e);
      expect(err).toBeInstanceOf(NotAvailableError);
      expect((err as NotAvailableError).missing).toBe('manifest');
    } finally { await n.stop(); }
  });

  it('keeps leased files and collects expired ones', async () => {
    const store = new MemoryBlockStore();
    const f = new StrandFiles({ blocks: store, leaseMs: 1000 });
    const kept = await f.put('s1', once(new Uint8Array(randomBytes(300_000))));
    const dropped = await f.put('s1', once(new Uint8Array(randomBytes(300_000))));
    await f.touch(kept.cid, 60_000);
    const removed = await f.gc(Date.now() + 5000);
    expect(removed.files).toBe(1);
    expect(removed.blocks).toBe(2);   // the dropped file's two chunks
    expect(await f.has(kept.cid)).toBe(true);
    expect(await f.has(dropped.cid)).toBe(false);
    // The index survives a reopen.
    const again = new StrandFiles({ blocks: store });
    expect(await again.has(kept.cid)).toBe(true);
  });
});

describe('announcements', () => {
  let a: Libp2p, b: Libp2p;
  afterAll(async () => { await Promise.allSettled([a?.stop(), b?.stop()]); });

  it('a member that wants an announced file fetches it, up to its limit', async () => {
    [a, b] = await Promise.all([node(), node()]);
    const fa = new StrandFiles({ blocks: new MemoryBlockStore() });
    const fb = new StrandFiles({ blocks: new MemoryBlockStore(), onAnnounce: () => 1_000_000 });
    await fa.serve('s1', lite(a));
    await fb.serve('s1', lite(b));
    await a.dial(b.getMultiaddrs()[0]);

    const small = await fa.put('s1', once(new Uint8Array(randomBytes(600_000))));
    const big = await fa.put('s1', once(new Uint8Array(randomBytes(1_500_000))));
    expect(await fa.announce('s1', small.cid)).toBe(1);
    await fa.announce('s1', big.cid);
    for (let i = 0; i < 50 && !(await fb.has(small.cid)); i++) await new Promise(r => setTimeout(r, 100));
    expect(await fb.has(small.cid)).toBe(true);
    // Over B's limit: the manifest is known, no chunk was fetched.
    expect(await fb.has(big.cid)).toBe(false);
    expect((await fb.manifest(big.cid))?.size).toBe(1_500_000);
  });
});

describe('native import', () => {
  it('gives the same CID as a plain put, empty files included', async () => {
    const { mkdtempSync, writeFileSync, readFileSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    // A block store that imports like a phone does: chunk by chunk, hashed outside the layer.
    const store = new MemoryBlockStore() as MemoryBlockStore & { importFile: NonNullable<import('./types.js').BlockStore['importFile']> };
    store.importFile = async (path, chunkSize, name) => {
      const all = new Uint8Array(readFileSync(path));
      const keys: string[] = [];
      for (let at = 0; at < all.length; at += chunkSize) {
        const chunk = all.subarray(at, at + chunkSize);
        const key = name(createHash('sha256').update(chunk).digest('hex'));
        await store.put(key, chunk);
        keys.push(key);
      }
      return { keys, size: all.length };
    };
    const dir = mkdtempSync(join(tmpdir(), 'files-import-'));
    for (const n of [0, 1000, 262_144, 600_001]) {
      const bytes = new Uint8Array(randomBytes(n));
      const path = join(dir, `f${n}`);
      writeFileSync(path, bytes);
      const imported = await new StrandFiles({ blocks: store }).putPath('s1', path, () => once(bytes));
      const plain = await new StrandFiles({ blocks: new MemoryBlockStore() }).put('s1', once(bytes));
      expect(imported).toEqual(plain);
    }
  });
});
