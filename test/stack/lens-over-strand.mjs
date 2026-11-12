/**
 * Lenses over a strand (Quereus docs/lens.md, docs/migration.md): can two versions of an app
 * share one strand, each with its OWN logical schema + lens (app-local, never synced) over
 * the shared basis (the strand's `App` tables, which sereus applies and Optimystic replicates)?
 *
 * One strand, basis v1: `App.Contact (Id, Name)`. B is the v1 app and uses `App.Contact`
 * directly. A is the v2 app: once the strand is open it declares, on its own strand Database,
 * `declare logical schema ChatV2 { table Person (Id, DisplayName) }` with
 * `declare lens for ChatV2 over App { view Person as select Id, Name as DisplayName from Contact }`
 * and works only through `ChatV2.Person`. Each step prints PASS or FAIL.
 *
 * Then two version-skew phases over the shared basis:
 *   PHASE=column  v2 adds a nullable column to the basis; v1 keeps writing, then re-opens on the
 *                 old basis (an app that has not upgraded, after a restart)
 *   PHASE=mv      v2 adds a materialized view derived from the v1 table (migration.md "expand");
 *                 is it maintained for local writes, and for rows arriving from the v1 member?
 *
 *   node test/stack/lens-over-strand.mjs                 # lens, then both phases
 *   PHASE=column node test/stack/lens-over-strand.mjs
 *   PHASE=mv node test/stack/lens-over-strand.mjs
 *   A_SAME=1 PHASE=column node …                         # control: A stays on v1 too
 *   OFFLINE=1 …                                          # strand offline mode (file journals)
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { webSockets } from '@libp2p/websockets';
import { CadreNode, DEFAULT_IDENTITY_KEY_ID, generateStrandMemberKey } from '@serfab/cadre-core';
import { FileKeyStore } from '@serfab/cadre-core/key-store-file';
import { runOwnerGenesis } from '@serfab/cadre-core/edge-node';
import { FileTrustedOwnerStore } from '@serfab/cadre-core/trusted-owner-store-file';
import { FileBootstrapPeerStore } from '@serfab/cadre-core/bootstrap-peer-store-file';
import { FileEnrolledMachineStore } from '@serfab/cadre-core/enrolled-machine-store-file';
import { FileStrandNetworkStateStore } from '@serfab/cadre-core/strand-network-state-file';
import { FileKVStore, FileRawStorage } from '@optimystic/db-p2p-storage-fs';

const OFFLINE = process.env.OFFLINE === '1';
const SAPP_ID = 'org.example.lens';
const V1 = { id: SAPP_ID, version: '1.0.0', signature: '', latencyHint: 'interactive',
  schema: 'table Contact (Id text primary key, Name text not null) with tags ("optimystic.network_watch" = true);' };
const LENS = `declare logical schema ChatV2 {
  table Person (Id text primary key, DisplayName text not null);
}
declare lens for ChatV2 over App {
  view Person as select Id, Name as DisplayName from Contact;
}
apply schema ChatV2;`;

const root = mkdtempSync(join(tmpdir(), 'lens-strand-'));
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);
let failures = 0;
const step = async (name, fn) => {
  try { const d = await fn(); log(`PASS  ${name}${d ? ` — ${d}` : ''}`); return true; }
  catch (e) { failures++; log(`FAIL  ${name} — ${e?.name ?? 'Error'}: ${String(e?.message ?? e).split('\n')[0].slice(0, 300)}`); return false; }
};
const rows = async (db, sql) => { const out = []; for await (const r of db.eval(sql)) out.push({ ...r }); return out; };
const until = async (what, check, ms = 60_000) => {
  const deadline = Date.now() + ms; let last;
  while (Date.now() < deadline) { try { last = await check(); if (last) return last; } catch (e) { last = e; } await new Promise(r => setTimeout(r, 500)); }
  throw new Error(`timed out (${ms / 1000} s) waiting for ${what}${last instanceof Error ? `: ${last.message}` : ''}`);
};

async function party(tag, partyId) {
  const dir = join(root, tag);
  const keyStore = new FileKeyStore(join(dir, 'keys'));
  const journals = new Map();
  const built = [];
  const node = new CadreNode({
    keyStore, identityKeyId: DEFAULT_IDENTITY_KEY_ID,
    controlNetwork: { partyId, bootstrapNodes: [] },
    profile: 'transaction',
    // The embedder that builds a store closes it (Optimystic IRawStorage.close), below.
    storage: { provider: scope => { const st = new FileRawStorage(join(dir, 'blocks', scope)); built.push(st); return st; } },
    network: { transports: [webSockets()], listenAddrs: ['/ip4/127.0.0.1/tcp/0/ws'], relayAddrs: [], requireRelay: false,
      connectionGater: { denyDialMultiaddr: () => false } },
    strandFilter: { mode: 'sAppId', sAppId: SAPP_ID },
    hibernation: { enabled: false },
    requireSignedSchemas: false,
    trustedOwners: { store: await FileTrustedOwnerStore.open(join(dir, 'node'), partyId) },
    bootstrapPeers: { store: await FileBootstrapPeerStore.open(join(dir, 'node'), partyId) },
    enrolledMachines: { store: await FileEnrolledMachineStore.open(join(dir, 'node'), partyId) },
    strandNetworkState: { store: await FileStrandNetworkStateStore.open(join(dir, 'node'), partyId) },
    ...(OFFLINE ? { strandOffline: {
      journal: scope => journals.get(scope) ?? journals.set(scope, new FileKVStore(join(dir, 'journal', scope))).get(scope),
      initialMode: 'offline' } } : {}),
  });
  const stopNode = node.stop.bind(node);
  node.stop = async () => {
    await stopNode();
    await Promise.allSettled([...built.map(st => st.close?.()), ...[...journals.values()].map(j => j.close?.())]);
  };
  await node.start();
  const genesis = await runOwnerGenesis(node, { keyStore, label: tag });
  if (genesis !== 'enrolled') throw new Error(`${tag}: genesis ${genesis}`);
  return node;
}


const A = await party('a', `a-${randomUUID()}`);
const B = await party('b', `b-${randomUUID()}`);
const strandId = `strand-${randomUUID()}`;
const founded = await A.foundStrand({ strandId, type: 'c', memberPrivateKey: await generateStrandMemberKey(), sAppConfig: V1 });
const aDb = founded.instance.database.getDatabase();
await aDb.exec(`insert into App.Contact (Id, Name) values ('c1', 'Alice (via App)')`);
const invitation = await A.createOpenInvitation(SAPP_ID, 3_600_000);
await A.publishFormationInvite(invitation.token, SAPP_ID, { strandId, expiresAtMs: Date.now() + 3_600_000, totalUses: 1 });
const formed = await B.formStrand(B.decodeInvitation(A.encodeInvitation(invitation)), { metadata: { name: 'B' } });
await B.addStrand({ strandRow: { Id: formed.strandId, MemberPrivateKey: formed.memberPrivateKey ?? null, Type: 'c', FounderOwnerKey: null, FounderPeerId: null },
  sAppConfig: V1, awaitFirstSync: false });
const bDb = (await B.whenStrandWritable(formed.strandId, { timeoutMs: 300_000 })).database.getDatabase();
await step('B (v1) joins and reads A\'s row through App.Contact', () =>
  until("A's row at B", async () => (await rows(bDb, 'select Id from App.Contact')).length >= 1 && 'c1'));

await step('A (v2) declares its logical schema and lens over App, locally', async () => { await aDb.exec(LENS); });
await step('A reads App.Contact through the lens as ChatV2.Person', async () => {
  const got = await rows(aDb, 'select Id, DisplayName from ChatV2.Person');
  if (!got.some(r => r.Id === 'c1' && r.DisplayName === 'Alice (via App)')) throw new Error(JSON.stringify(got));
  return JSON.stringify(got);
});
await step('the lens is app-local: B has no ChatV2', async () => {
  try { await rows(bDb, 'select * from ChatV2.Person'); } catch (e) { return `B: ${e.message.split('\n')[0]}`; }
  throw new Error('B can read ChatV2.Person');
});
await step('A inserts through the lens (ChatV2.Person)', async () => {
  await aDb.exec(`insert into ChatV2.Person (Id, DisplayName) values ('c2', 'Bob (via lens)')`);
  const local = await rows(aDb, "select Name from App.Contact where Id = 'c2'");
  if (local[0]?.Name !== 'Bob (via lens)') throw new Error(`App.Contact on A: ${JSON.stringify(local)}`);
  return 'landed in App.Contact on A';
});
await step("A's lens insert reaches B (v1) as an App.Contact row", () =>
  until('c2 at B', async () => { const r = await rows(bDb, "select Name from App.Contact where Id = 'c2'"); return r[0]?.Name === 'Bob (via lens)' && r[0].Name; }));
await step('A updates through the lens', async () => {
  await aDb.exec(`update ChatV2.Person set DisplayName = 'Bob (renamed via lens)' where Id = 'c2'`);
});
await step("A's lens update reaches B", () =>
  until('the update at B', async () => { const r = await rows(bDb, "select Name from App.Contact where Id = 'c2'"); return r[0]?.Name === 'Bob (renamed via lens)' && r[0].Name; }));
await step('B (v1) inserts into App.Contact', async () => { await bDb.exec(`insert into App.Contact (Id, Name) values ('c3', 'Carol (via App on B)')`); });
await step("B's row reaches A, read through the lens", () =>
  until('c3 in ChatV2.Person on A', async () => { const r = await rows(aDb, "select DisplayName from ChatV2.Person where Id = 'c3'"); return r[0]?.DisplayName; }));
await step('A deletes through the lens, and B sees it gone', async () => {
  await aDb.exec(`delete from ChatV2.Person where Id = 'c1'`);
  return until('c1 gone at B', async () => (await rows(bDb, "select Id from App.Contact where Id = 'c1'")).length === 0 && 'gone');
});
await step('a lens constraint holds on write (DisplayName not null)', async () => {
  try { await aDb.exec(`insert into ChatV2.Person (Id, DisplayName) values ('c4', null)`); } catch (e) { return `refused: ${e.message.split('\n')[0]}`; }
  throw new Error('a null DisplayName was accepted');
});

// ── Phase 2: v2 changes the shared basis by ADDING a column; v1 keeps applying the old basis.
// migration.md: "logical evolution produces additive basis diffs"; the question is what sereus's
// per-app `apply schema App` (a declarative diff) does when the old app declares the basis without it.
const V2COL = { ...V1, version: '1.1.0',
  schema: 'table Contact (Id text primary key, Name text not null, Nick text null) with tags ("optimystic.network_watch" = true);' };
const aRow = { Id: strandId, MemberPrivateKey: null, Type: 'c', FounderOwnerKey: null, FounderPeerId: null };
let aDb2 = aDb;
if (process.env.PHASE !== 'mv') {
  await step('A re-opens the strand on basis v1.1 (Contact gains a nullable Nick column)', async () => {
    const row = await A.getControlDatabase().queryStrand(strandId);
    await A.stopStrand(strandId);
    const inst = await A.addStrand({ strandRow: row ?? aRow, sAppConfig: process.env.A_SAME === '1' ? V1 : V2COL, awaitFirstSync: false });
    aDb2 = inst.database.getDatabase();
    await until('the new column on A', async () => { await rows(aDb2, 'select Nick from App.Contact limit 1'); return true; });
    return `state ${inst.database.appSchemaState?.()}`;
  });
  await step('A writes the new column', async () => { await aDb2.exec(`insert into App.Contact (Id, Name, Nick) values ('c5', 'Dave', 'D')`); });
  await step("A's row (with Nick) reaches B on v1, which reads it without the column", () =>
    until('c5 at B', async () => { const r = await rows(bDb, "select Id, Name from App.Contact where Id = 'c5'"); return r[0]?.Name; }));
  await step('B on v1 still writes', async () => { await bDb.exec(`insert into App.Contact (Id, Name) values ('c6', 'Erin (v1 on B)')`); });
  await step("B's v1 row reaches A, with Nick null", () =>
    until('c6 at A', async () => { const r = await rows(aDb2, "select Name, Nick from App.Contact where Id = 'c6'"); return r.length ? JSON.stringify(r[0]) : false; }));
  await step('B re-opens on the OLD basis v1 (its app has not upgraded): does it take the column away?', async () => {
    const row = await B.getControlDatabase().queryStrand(formed.strandId).catch(() => undefined);
    await B.stopStrand(formed.strandId);
    const inst = await B.addStrand({ strandRow: row ?? { Id: formed.strandId, MemberPrivateKey: formed.memberPrivateKey ?? null, Type: 'c', FounderOwnerKey: null, FounderPeerId: null },
      sAppConfig: V1, awaitFirstSync: false });
    await new Promise(r => setTimeout(r, 5000));
    return `B state ${inst.database.appSchemaState?.()}`;
  });
  await step('after B re-applied v1, A still has Nick and its value', () =>
    until("Nick on A", async () => { const r = await rows(aDb2, "select Nick from App.Contact where Id = 'c5'"); return r[0]?.Nick === 'D' && 'D'; }, 20_000));
}

if (process.env.PHASE !== 'column') {
// ── Phase 3: migration.md "expand": v2 publishes a NEW basis table maintained from the old one
  // (a materialized view in the strand's schema), and its lens maps over the new table.
  const V2MV = { ...V1, version: '1.2.0',
    schema: `table Contact (Id text primary key, Name text not null) with tags ("optimystic.network_watch" = true);
    materialized view ContactKey as select Id, lower(Name) as NameKey from Contact;` };
  await step('A re-opens on basis v1.2: Contact plus a materialized view ContactKey derived from it', async () => {
    const row = await A.getControlDatabase().queryStrand(strandId);
    await A.stopStrand(strandId);
    const inst = await A.addStrand({ strandRow: row ?? aRow, sAppConfig: V2MV, awaitFirstSync: false });
    aDb2 = inst.database.getDatabase();
    const got = await until('ContactKey readable on A', async () => (await rows(aDb2, 'select Id, NameKey from App.ContactKey')).length > 0 && await rows(aDb2, 'select Id, NameKey from App.ContactKey'));
    return `state ${inst.database.appSchemaState?.()}; ${got.length} derived rows`;
  });
  await step('control: a LOCAL write on A is derived into ContactKey', async () => {
    await aDb2.exec(`insert into App.Contact (Id, Name) values ('c8', 'GRACE')`);
    return until('c8 in ContactKey on A', async () => { const r = await rows(aDb2, "select NameKey from App.ContactKey where Id = 'c8'"); return r[0]?.NameKey === 'grace' && 'grace'; }, 20_000);
  });
  await step("control: B's v1 write reaches A's Contact (the MV's source)", async () => {
    await bDb.exec(`insert into App.Contact (Id, Name) values ('c9', 'HEIDI')`);
    return until('c9 in Contact on A', async () => { const r = await rows(aDb2, "select Name from App.Contact where Id = 'c9'"); return r[0]?.Name; }, 30_000);
  });
  await step('a v1 write on B is derived into ContactKey on A', async () => {
    await bDb.exec(`insert into App.Contact (Id, Name) values ('c7', 'FRANK')`);
    return until('c7 in ContactKey on A', async () => { const r = await rows(aDb2, "select NameKey from App.ContactKey where Id = 'c7'"); return r[0]?.NameKey === 'frank' && 'frank'; });
  });
}

log(failures ? `RESULT: ${failures} step(s) FAILED` : 'RESULT: a v2 app with its own lens and a v1 app share one strand, both ways');
await Promise.allSettled([A.stop(), B.stop()]);
process.exit(failures ? 1 : 0);
