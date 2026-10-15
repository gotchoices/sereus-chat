/**
 * What crossing between JavaScript and Java costs in this runtime: a plain Java call, a Java
 * call carrying bytes, and copying bytes element by element, at several sizes. The phone's
 * networking crosses for every WebSocket message and every SQLite blob, so this is the
 * per-message tax. Milliseconds per call.
 *
 * The `ByteString.of(ArrayBuffer)` and direct-ByteBuffer rows hand Java a new
 * DirectByteBuffer per call, held by a JNI global reference until V8 collects it: they are
 * here to measure, not to copy (an app doing that per message hits Android's 51,200-reference
 * limit and aborts). The reused-buffer row is what the plugin patches do.
 */
declare const okio: { ByteString: { of(data: unknown): unknown } };
const fromByteBuffer = (b: unknown) => (ArrayBuffer as unknown as { from(b: unknown): ArrayBuffer }).from(b);
export function runBridgeCost(): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  const time = (reps: number, f: () => unknown) => {
    const t0 = Date.now();
    for (let k = 0; k < reps; k++) f();
    return +((Date.now() - t0) / reps).toFixed(4);
  };
  out.plain = {
    'System.nanoTime()': time(20000, () => java.lang.System.nanoTime()),
    'new java.lang.Object()': time(5000, () => new java.lang.Object()),
  };
  const reused = java.nio.ByteBuffer.allocateDirect(65536);
  const reusedView = new Uint8Array(fromByteBuffer(reused));
  for (const n of [32, 2048, 16384]) {
    const src = new Uint8Array(n);
    for (let i = 0; i < n; i++) src[i] = i & 255;
    const reps = Math.max(20, Math.floor(100000 / n));
    out[`${n} bytes`] = {
      'okio.ByteString.of(ArrayBuffer)': time(reps, () => okio.ByteString.of(src.buffer.slice(0, n))),
      'okio.ByteString.of(reused direct buffer)': time(reps, () => { reusedView.set(src, 0); reused.clear(); reused.limit(n); return okio.ByteString.of(reused); }),
      'byte[] filled per element': time(reps, () => { const b = Array.create('byte', n); for (let i = 0; i < n; i++) b[i] = src[i]; return b; }),
      'byte[] via direct ByteBuffer': time(reps, () => { const d = java.nio.ByteBuffer.allocateDirect(n); new Uint8Array(fromByteBuffer(d)).set(src); const b = Array.create('byte', n); d.get(b); return b; }),
    };
  }
  return out;
}

/**
 * What SQLite costs here, through the same opener and settings as the node's storage
 * (`openOptimysticNSDb`: WAL, synchronous NORMAL), on a throwaway database: the journal
 * mode actually in effect, single autocommit writes of a 1 KB blob, the same writes in one
 * transaction, and reads. Milliseconds per statement.
 */
export async function runSqliteCost(): Promise<Record<string, unknown>> {
  const { openOptimysticNSDb } = await import('@optimystic/db-p2p-storage-ns');
  const { dbPath } = await import('./db-path');
  const db = await openOptimysticNSDb(dbPath(`bench-${Date.now()}`));
  const mode = await db.prepare('PRAGMA journal_mode').get();
  const sync = await db.prepare('PRAGMA synchronous').get();
  const blob = new Uint8Array(1024).map((_, i) => i & 255);
  const put = db.prepare('INSERT OR REPLACE INTO kv (key, s_val, b_val) VALUES (?, NULL, ?)');
  const get = db.prepare('SELECT b_val FROM kv WHERE key = ?');
  const n = 100;
  let t0 = Date.now();
  for (let i = 0; i < n; i++) await put.run(`a${i}`, blob);
  const autocommit = (Date.now() - t0) / n;
  t0 = Date.now();
  await db.transaction(async tx => { const p = tx.prepare('INSERT OR REPLACE INTO kv (key, s_val, b_val) VALUES (?, NULL, ?)'); for (let i = 0; i < n; i++) await p.run(`t${i}`, blob); });
  const inTransaction = (Date.now() - t0) / n;
  t0 = Date.now();
  for (let i = 0; i < n; i++) await get.get(`a${i}`);
  const read = (Date.now() - t0) / n;
  return { journalMode: mode, synchronous: sync, 'write 1 KB, autocommit': autocommit, 'write 1 KB, in a transaction': inTransaction, 'read 1 KB': read };
}
