/**
 * The device test gotchoices/Optimystic#38 asks for before moving `db-p2p-storage-ns` to
 * `@nativescript-community/sqlite` 4.x: the storage opened through `openOptimysticNSDb` on
 * 4.x, a write followed by an app kill, and reads made during a write. Run from the
 * Diagnostics page ("SQLite 4 check"); each result is logged as `[sq4] …` for
 * `test/devices` scripts, which kill the app right after the `markers written` line and
 * read `markers held` on the next run.
 *
 * Not app code: a probe on its own database (`sq4-check`), kept across runs on purpose so
 * a kill can be checked from the next launch.
 */
import { dbPath } from './db-path';

type Say = (line: string) => void;
const log = (say: Say, line: string) => { console.log(`[sq4] ${line}`); say(line); };

export async function runSqlite4Check(say: Say): Promise<Record<string, unknown>> {
  const result: Record<string, unknown> = {};

  // 1. Which SQLite runs: 4.x bundles one on Android (androidx sqlite-bundled) instead of
  //    the platform's, which on Android 8 (SQLite 3.18) lacks UPSERT.
  const plugin = (await import('@nativescript-community/sqlite')) as unknown as {
    openOrCreate(path: string): { ready: Promise<void>; getSqliteVersion(): Promise<string>; close(): Promise<void> };
  };
  const probe = plugin.openOrCreate(dbPath('sq4-version'));
  await probe.ready;
  result.sqliteVersion = await probe.getSqliteVersion();
  await probe.close();
  log(say, `engine: SQLite ${String(result.sqliteVersion)}`);

  // 2. The storage's own opener, on a database kept across runs.
  const { openOptimysticNSDb, SqliteRawStorage } = await import('@optimystic/db-p2p-storage-ns');
  const db = await openOptimysticNSDb(dbPath('sq4-check'));
  result.journalMode = await db.prepare('PRAGMA journal_mode').get();
  await db.exec('CREATE TABLE IF NOT EXISTS probe (n INTEGER PRIMARY KEY, synced INTEGER NOT NULL, at INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS conc (i INTEGER PRIMARY KEY)');

  // 3. What survived the last run's kill.
  const held = await db.prepare('SELECT n, synced FROM probe ORDER BY n').all();
  result.markersHeld = held;
  log(say, `markers held from earlier runs: ${JSON.stringify(held)}`);

  // 4. UPSERT, as the block store's durability mark writes it (sqlite-sync.js).
  try {
    await db.exec('INSERT INTO durability_mark (id, n) VALUES (1, 1) ON CONFLICT(id) DO UPDATE SET n = n + 1');
    result.upsert = 'ok';
  } catch (err) {
    result.upsert = err instanceof Error ? err.message : String(err);
  }
  log(say, `upsert: ${String(result.upsert)}`);

  // 5. Reads during a write: a 2000-row transaction, and point reads issued while it runs.
  await db.exec('DELETE FROM conc');
  const counts = new Map<number, number>();
  let reads = 0;
  let readErrors = 0;
  let writing = true;
  const reader = (async () => {
    const count = db.prepare('SELECT count(*) AS c FROM conc');
    while (writing) {
      try {
        const row = await count.get() as { c: number } | undefined;
        const c = Number(row?.c ?? -1);
        counts.set(c, (counts.get(c) ?? 0) + 1);
        reads++;
      } catch {
        readErrors++;
      }
    }
  })();
  const t0 = Date.now();
  await db.transaction(async tx => {
    const insert = tx.prepare('INSERT INTO conc (i) VALUES (?)');
    for (let i = 0; i < 2000; i++) await insert.run(i);
  });
  const writeMs = Date.now() - t0;
  writing = false;
  await reader;
  const seen = [...counts.keys()].sort((a, b) => a - b);
  result.concurrent = {
    writeMs, reads, readErrors,
    countsSeen: seen.length > 12 ? [...seen.slice(0, 6), '…', ...seen.slice(-6)] : seen,
    sawUncommittedRows: seen.some(c => c > 0 && c < 2000),
  };
  log(say, `reads during a write: ${JSON.stringify(result.concurrent)}`);

  // 6. The block store end to end: a metadata record written, flushed (durable), read back.
  const storage = new SqliteRawStorage(db);
  const blockId = `sq4-${Date.now()}`;
  await storage.saveMetadata(blockId, { latest: undefined, ranges: [[0]] } as never);
  await storage.flush();
  const back = await storage.getMetadata(blockId);
  result.blockStore = back ? 'ok' : 'metadata not read back';
  log(say, `block store: ${String(result.blockStore)}`);

  // 7. Markers for the kill test: one autocommit write (synchronous NORMAL), one synced
  //    transaction (FULL). A process kill should keep both: WAL commits survive it.
  const next = Number((await db.prepare('SELECT coalesce(max(n), 0) + 1 AS n FROM probe').get() as { n: number }).n);
  await db.prepare('INSERT INTO probe (n, synced, at) VALUES (?, 0, ?)').run(next, Date.now());
  await db.transaction(async tx => { await tx.prepare('INSERT INTO probe (n, synced, at) VALUES (?, 1, ?)').run(next + 1, Date.now()); },
    { synced: true });
  result.markersWritten = [next, next + 1];
  log(say, `markers written: ${next} (autocommit), ${next + 1} (synced) — kill now`);
  return result;
}
