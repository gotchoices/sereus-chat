/**
 * Does one INSERT into an Optimystic table cost more as the table grows? Quereus plus
 * `@optimystic/quereus-plugin-optimystic` alone, `transactor='test'` (no network, no Sereus),
 * against a Quereus in-memory table of the same shape as the baseline.
 *
 *   node test/stack/optimystic-insert-scale.mjs
 *   SIZES=100,1000,5000,10000 node test/stack/optimystic-insert-scale.mjs
 */
import { Database } from '@quereus/quereus';
import { register } from '@optimystic/quereus-plugin-optimystic';
import { randomUUID } from 'node:crypto';

const SIZES = (process.env.SIZES ?? '100,1000,5000').split(',').map(Number);
const db = new Database();
const plugin = register(db, { debug: false });
for (const v of plugin.vtables ?? []) db.registerModule(v.name, v.module, v.auxData);
for (const f of plugin.functions ?? []) db.registerFunction?.(f.schema ?? f);
await db.exec(`create table O (Id text primary key, V text not null) using optimystic('tree://scale/O', transactor='test', keyNetwork='test')`);
await db.exec(`create table M (Id text primary key, V text not null)`);

const median = async (fn, reps) => {
  const ms = [];
  for (let r = 0; r < reps; r++) { const t = performance.now(); await fn(); ms.push(performance.now() - t); }
  ms.sort((a, b) => a - b);
  return ms[Math.floor(ms.length / 2)];
};

console.log('rows | optimystic: one insert (ms) | point read by key (ms) | memory table: one insert (ms)');
let have = 0;
const keys = [];
for (const size of SIZES) {
  while (have < size) {
    const n = Math.min(500, size - have);
    await db.exec('begin');
    for (let i = 0; i < n; i++, have++) {
      const id = randomUUID();
      if (have % 97 === 0) keys.push(id);
      await db.exec('insert into O (Id, V) values (?, ?)', [id, `v${have}`]);
      await db.exec('insert into M (Id, V) values (?, ?)', [id, `v${have}`]);
    }
    await db.exec('commit');
  }
  const opt = await median(() => db.exec('insert into O (Id, V) values (?, ?)', [randomUUID(), 'one more']), 15);
  const read = await median(async () => { for await (const _ of db.eval('select V from O where Id = ?', [keys[keys.length >> 1]])) { /* one row */ } }, 7);
  const mem = await median(() => db.exec('insert into M (Id, V) values (?, ?)', [randomUUID(), 'one more']), 15);
  console.log(`${String(size).padStart(5)} | ${opt.toFixed(2).padStart(27)} | ${read.toFixed(2).padStart(22)} | ${mem.toFixed(2).padStart(30)}`);
}
process.exit(0);
