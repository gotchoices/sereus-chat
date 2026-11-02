/**
 * Does an Optimystic table use a secondary index to serve an ORDER BY or a range predicate?
 * The same table, the same index and the same queries on a Quereus memory table and on an
 * Optimystic table (`transactor='test'`, no network): each query's median time and plan.
 *
 *   node test/stack/index-ordering-plans.mjs            # 2000 rows
 *   ROWS=5000 node test/stack/index-ordering-plans.mjs
 *
 * Found measuring Sereus Chat's message list, whose "newest 100" (`order by Timestamp desc,
 * Id desc limit 100`) costs a full scan of the conversation whatever index exists.
 */
import { Database } from '@quereus/quereus';
import { register } from '@optimystic/quereus-plugin-optimystic';
import { randomUUID } from 'node:crypto';

const ROWS = Number(process.env.ROWS ?? 2000);
const QUERIES = [
  'select Id from M order by T asc limit 10',
  "select Id from M where T > 't001990' order by T",
  "select Id from M where T > 't001990'",
  "select Id from M where T = 't001000'",
  'select Id from M order by T desc limit 10',
];

const plan = async (db, q) => {
  const ops = [];
  for await (const row of db.eval(`select * from query_plan('${q.replace(/'/g, "''")}')`)) ops.push(row.op);
  return ops.filter(op => /SCAN|SEEK|SORT|FILTER/.test(op)).join(' ');
};
const median = async (db, q) => {
  const ms = [];
  for (let r = 0; r < 7; r++) { const t = performance.now(); for await (const _ of db.eval(q)) { /* drain */ } ms.push(performance.now() - t); }
  ms.sort((a, b) => a - b);
  return ms[3];
};

console.log(`${ROWS} rows; table M (Id text primary key, T text not null); index MT on M (T)`);
const results = {};
for (const kind of ['memory', 'optimystic']) {
  const db = new Database();
  const plugin = register(db, { debug: false });
  for (const v of plugin.vtables ?? []) db.registerModule(v.name, v.module, v.auxData);
  const using = kind === 'optimystic' ? ` using optimystic('tree://plans/${randomUUID().slice(0, 8)}', transactor='test', keyNetwork='test')` : '';
  await db.exec(`create table M (Id text primary key, T text not null)${using}`);
  await db.exec('create index MT on M (T)');
  await db.exec('begin');
  for (let i = 0; i < ROWS; i++) await db.exec('insert into M values (?, ?)', [randomUUID(), `t${String(i).padStart(6, '0')}`]);
  await db.exec('commit');
  await new Promise(r => setTimeout(r, 3000)); // let the bulk insert settle
  for (const q of QUERIES) (results[q] ??= {})[kind] = { ms: await median(db, q), plan: await plan(db, q) };
}
for (const q of QUERIES) {
  const { memory: m, optimystic: o } = results[q];
  console.log(`\n${q}\n  memory:     ${m.ms.toFixed(1).padStart(7)} ms  ${m.plan}\n  optimystic: ${o.ms.toFixed(1).padStart(7)} ms  ${o.plan}`);
}
process.exit(0);
