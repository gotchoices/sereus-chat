/**
 * Reproduction (sereus): a strand app's schema cannot declare Optimystic 1.29's `blobref` column.
 *
 * Optimystic 1.29 adds a column type, `blobref`, which its Quereus plugin returns from `register`
 * in a new `types` list beside `vtables`, `functions` and `collations`. Sereus registers the
 * plugin through `applyRegistrations` (`quereus-plugin-sereus`, `compose-strand`), which registers
 * the other three lists but not `types`. A strand whose app schema declares a `blobref` column then
 * cannot be founded.
 *
 * Expected: the strand is founded; a valid blob reference is stored; a value that is not one is
 * refused (the type's own check).
 *
 *   node test/stack/blobref-type.mjs
 *
 * One node, no peers. Exit 0 when the expected happens.
 */
import { soloStrand, versions } from './solo-node.mjs';

console.log(await versions());
const DDL = 'table Photo (Id text primary key, Content blobref null)';
let strand, stop;
try {
  ({ strand, stop } = await soloStrand('blobref-type', DDL));
} catch (err) {
  console.error(`FAIL: founding a strand whose schema is "${DDL}" threw:\n  ${err?.name}: ${err?.message}`);
  if (err?.cause) console.error(`  cause: ${err.cause?.name}: ${err.cause?.message}`);
  process.exit(1);
}
const db = strand.database.getDatabase();
let code = 0;
try {
  // A canonical reference: a CIDv1 (dag-pb, sha-256) in lowercase base32, 59 characters.
  const ref = 'bafybeie46edlri4jdxwcrahqixweruvrcwxaqc77wazby2esrfr4ovwjze';
  await db.exec('insert into App.Photo (Id, Content) values (?, ?)', ['ok', ref]);
  console.log('stored a valid reference');
  try {
    await db.exec('insert into App.Photo (Id, Content) values (?, ?)', ['bad', 'not a reference']);
    console.error('FAIL: a value that is not a blob reference was stored (the column is not checked as blobref)');
    code = 1;
  } catch (err) {
    console.log(`refused a value that is not a reference: ${err?.message}`);
  }
  if (code === 0) console.log('PASS: the blobref column is declared, stores a reference and checks its values');
} finally {
  await stop();
}
process.exit(code);
