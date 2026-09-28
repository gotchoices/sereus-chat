/**
 * restart-reconverge.mjs — do two relay-only parties still converge AFTER A RESTART?
 *
 * THE GAP THIS FILLS. Every harness in this directory opens its storage with
 * `mkdtempSync`, so every Node run we have ever done starts from nothing and
 * therefore only ever exercises ONE path: form a strand, then converge. That path
 * works — reliably, including between two separate machines through a public relay.
 *
 * The phones fail on a DIFFERENT path, and we had never run it in Node. A phone
 * that has been restarted does not form anything. It comes up, rediscovers the
 * strand from its own control database, re-attaches it, and has to find its
 * partner again from a cold start — with no formation handshake in hand to hand
 * it the partner's addresses. On the devices that state produces a FRET ring
 * containing only self (`band=1`, measured) and a cohort of one.
 *
 * So the confound in everything measured so far is that "Node" and "React Native"
 * were never running the same experiment: Node had just formed, the phones had
 * just restarted. This script removes that. Same runtime, same relay, same code —
 * the only variable is whether the parties are fresh or restarted.
 *
 *   PHASE 1  form, converge, verify        (the known-good path)
 *   PHASE 2  destroy both nodes, rebuild them over the SAME storage,
 *            attach nothing by hand, and see whether they find each other again
 *
 * Both outcomes are worth having, and neither depends on a phone:
 *
 *   PHASE 2 FAILS → a pure-Node failure on the restart path, with no React Native
 *                   in it. Whether it is the SAME bug as the phones is a separate
 *                   question this script does not answer — only that a restarted
 *                   relay-only pair stops replicating.
 *   PHASE 2 PASSES → the restart path is fine in Node, so the device failure is
 *                   genuinely RN-specific and the biggest confound is eliminated.
 *
 *   RELAY_ADDR=/dns4/relay.example/tcp/4011/ws/p2p/12D3Koo… node restart-reconverge.mjs
 *
 * Storage lives under STORE_ROOT (default a fixed directory in the system temp
 * dir) and is REUSED by phase 2 — that reuse is the whole point, so the script
 * refuses to run phase 2 if it cannot reopen what phase 1 wrote.
 */
import { CadreNode, ControlFormationUsageRecorder, generateStrandMemberKey } from '@serfab/cadre-core';
import { LevelDBRawStorage } from '@optimystic/db-p2p-storage-rn';
import { webSockets } from '@libp2p/websockets';
import { circuitRelayTransport } from '@libp2p/circuit-relay-v2';
import { generateKeyPair, privateKeyToProtobuf, privateKeyFromProtobuf } from '@libp2p/crypto/keys';
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { FileBootstrapPeerStore } from '@serfab/cadre-core/bootstrap-peer-store-file';
import { openTestDb } from './classic-level-driver.mjs';

const RELAY_ADDR = process.env.RELAY_ADDR;
if (!RELAY_ADDR) {
  console.error('RELAY_ADDR is required — this is a relay-only test, as the phones are.');
  process.exit(2);
}
const STORE_ROOT = process.env.STORE_ROOT ?? join(tmpdir(), 'restart-reconverge');
const FRESH = process.env.FRESH !== '0';
/** How long phase 2 is given to re-find the partner. Generous: the claim is "never", not "slow". */
const RECONVERGE_MS = Number(process.env.RECONVERGE_MS ?? 180_000);
const REACHABLE_MS = Number(process.env.REACHABLE_MS ?? 60_000);

const SCHEMA = `table Member (
    Id text primary key,
    Name text not null,
    AvatarUri text null
);`;
const SAPP = {
  id: 'org.sereus.chat.restartcheck',
  version: '0.1.0',
  schema: SCHEMA,
  signature: '',
  latencyHint: 'interactive',
};

const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);

if (FRESH && existsSync(STORE_ROOT)) rmSync(STORE_ROOT, { recursive: true, force: true });
mkdirSync(STORE_ROOT, { recursive: true });

/**
 * The peer identity must survive the restart too — a party that comes back with a
 * NEW peer id is a different machine as far as the cohort is concerned, which
 * would be a different (and much less interesting) experiment. Phones persist
 * theirs; so do we.
 */
async function identityFor(tag) {
  const file = join(STORE_ROOT, `${tag}.key`);
  if (existsSync(file)) return privateKeyFromProtobuf(readFileSync(file));
  const key = await generateKeyPair('Ed25519');
  writeFileSync(file, privateKeyToProtobuf(key));
  return key;
}

const openDbs = new Map();
function storageFor(tag) {
  return (strandId) => {
    const name = `${tag}-${strandId}`;
    let handle = openDbs.get(name);
    if (!handle) {
      handle = openTestDb(name, 0, STORE_ROOT);
      openDbs.set(name, handle);
    }
    return new LevelDBRawStorage(handle.db);
  };
}

async function closeDbs() {
  for (const [, h] of openDbs) { try { await h.cleanup(); } catch { /* best effort */ } }
  openDbs.clear();
}

/**
 * Attach strands as they are rediscovered — WITHOUT THIS THE TEST IS VOID.
 *
 * cadre-core does not auto-attach. `StrandWatcher` polls the control database and
 * EMITS `strand:discovered`; the embedder must call `addStrand` itself, which is
 * exactly what the chat app does (`chat-strand.ts`, the `strand:discovered`
 * subscription). A first version of this script omitted it and phase 2 reported
 * both strands ABSENT — which looked like a dramatic stack failure and was
 * entirely this file's fault. Guard on an in-flight set as well as
 * `getStrands()`, per the event's own contract: the manager tracks an instance
 * only once `addStrand` resolves.
 */
function autoAttach(node, tag) {
  const attaching = new Set();
  node.on('strand:discovered', ({ strandId, strand }) => {
    if (attaching.has(strandId) || node.getStrands().has(strandId)) return;
    attaching.add(strandId);
    void (async () => {
      try {
        await node.addStrand({ strandRow: strand, sAppConfig: SAPP });
        log(`${tag}: attached rediscovered strand ${strandId}`);
      } catch (e) {
        log(`${tag}: attach of rediscovered ${strandId} failed — ${e?.message ?? e}`);
      } finally {
        attaching.delete(strandId);
      }
    })();
  });
}

async function startParty(tag, partyId) {
  /**
   * THE RETAINED DIAL TARGETS, and they must outlive the process.
   *
   * `CadreNodeConfig.bootstrapPeers.store` is documented as: "Absent ⇒ an
   * in-memory store is created at start() (ephemeral: the retry set does not
   * survive the process, and such a node is stranded permanently if it restarts
   * before connecting)" — and cadre-node's own field doc calls these entries "the
   * node's only way back to those peers if it is ever stranded again".
   *
   * That is this script's exact scenario, so omitting the store made the harness
   * itself the likely cause of the phase-2 failure. The Node CLI, the browser and
   * React Native all inject a durable backend; only this rig did not.
   *
   * ONE VARIABLE: this is the sole change from the run that produced sereus#18.
   */
  const bootstrapStore = await FileBootstrapPeerStore.open(
    join(STORE_ROOT, `${tag}-bootstrap`), partyId);

  const node = new CadreNode({
    privateKey: await identityFor(tag),
    controlNetwork: { partyId, bootstrapNodes: [] },
    bootstrapPeers: { store: bootstrapStore },
    profile: 'transaction',
    strandFilter: { mode: 'all' },
    storage: { provider: storageFor(tag) },
    network: {
      transports: [webSockets(), circuitRelayTransport()],
      // Relay-only, exactly as a phone is: no listener of our own.
      listenAddrs: [],
      relayAddrs: [RELAY_ADDR],
      requireRelay: false,
    },
    hibernation: { enabled: false },
    requireSignedSchemas: false,
  });
  // Subscribed BEFORE start(), so a strand discovered on the watcher's first
  // poll is not missed.
  autoAttach(node, tag);
  await node.start();
  const owner = node.getIdentityOwnerKey();
  await node.getControlDatabase().ensureOwnerKey(owner.publicKeyB64);
  node.initializeSeedBootstrap(owner.privateKeyB64);
  return node;
}

async function awaitReachable(node, tag) {
  const until = Date.now() + REACHABLE_MS;
  while (Date.now() < until) {
    if (node.getMultiaddrs().length > 0) {
      log(`${tag}: reachable — ${node.getMultiaddrs().length} address(es)`);
      return true;
    }
    await new Promise(r => setTimeout(r, 500));
  }
  const st = node.getRelayReservationState?.();
  log(`${tag}: !! no reservation after ${REACHABLE_MS / 1000}s` +
      (st ? ` — status ${st.status}, error ${st.error ?? 'none'}` : ''));
  return false;
}

async function countMembers(instance) {
  const db = instance?.database?.getDatabase?.();
  if (!db) return -1;
  const it = db.eval('select Id from App.Member')[Symbol.asyncIterator]();
  let n = 0;
  for (let s = await it.next(); !s.done; s = await it.next()) n += 1;
  return n;
}

/** The strand this party holds, whether it founded it, formed it, or rediscovered it. */
function strandOf(node, strandId) {
  // `getStrands()` returns a Map, not an array — no `.find` here.
  return node.getStrand(strandId) ?? null;
}

const partyHost = `restart-host-${process.env.PARTY_SUFFIX ?? 'a'}`;
const partyJoiner = `restart-joiner-${process.env.PARTY_SUFFIX ?? 'a'}`;
const strandIdFile = join(STORE_ROOT, 'strand-id');
/**
 * The joiner's half of a restart, and it is NOT optional — see `rememberJoinedStrand`
 * in `apps/mobile/src/data/chat-strand.ts`, whose comment says it outright:
 *
 *   "NOTHING ELSE REMEMBERS THESE. `addStrand` is the attach half only and never
 *    publishes the `Strand` row — correct for a joiner, since cadre-core expects a
 *    joiner's row to have arrived over its own control network. Across PARTIES it
 *    never does... So without this list, a restart loses the strand outright."
 *
 * The host re-finds its strand through its own control DB; the joiner cannot,
 * because the row was published into the HOST's cadre and this party is not in it.
 * The `MemberPrivateKey` is handed over exactly once, in the formation result, and
 * written to neither control DB — so it has to be kept here or the closed strand is
 * unreadable forever after. A harness without this list reports the joiner's strand
 * ABSENT after restart, which is correct behaviour being mistaken for a bug.
 */
const joinedFile = join(STORE_ROOT, 'joined-strands.json');
function rememberJoin(row) { writeFileSync(joinedFile, JSON.stringify([row], null, 2)); }
function rememberedJoins() {
  if (!existsSync(joinedFile)) return [];
  try { return JSON.parse(readFileSync(joinedFile, 'utf8')); } catch { return []; }
}

let host, joiner;
try {
  // ─────────────────────────── PHASE 1: form ───────────────────────────
  log('PHASE 1 — form and converge (the path every other harness here tests)');
  host = await startParty('host', partyHost);
  if (!await awaitReachable(host, 'HOST')) process.exit(3);
  joiner = await startParty('joiner', partyJoiner);
  if (!await awaitReachable(joiner, 'JOINER')) process.exit(3);

  const strandId = randomUUID();
  writeFileSync(strandIdFile, strandId);
  const memberPrivateKey = await generateStrandMemberKey();
  const founded = await host.foundStrand({ strandId, type: 'c', memberPrivateKey, sAppConfig: SAPP });
  log(`HOST: founded ${strandId}, status ${founded.instance.status}`);

  host.initializeStrandSolicitation({
    formationUsageRecorder: new ControlFormationUsageRecorder(host.getControlDatabase()),
  });
  const invitation = await host.createOpenInvitation(SAPP.id, 60 * 60 * 1000);
  await host.publishFormationInvite(invitation.token, SAPP.id, {
    expiresAtMs: invitation.expiration.getTime(), strandId,
  });

  const formed = await joiner.formStrand(invitation, {
    partyId: joiner.peerId?.toString(), purpose: 'restart check', metadata: { app: SAPP.id },
  });
  log(`JOINER: formation returned, bound to ${formed.strandId === strandId ? 'the host\'s strand' : formed.strandId}`);
  const joinerRow = {
    Id: formed.strandId,
    MemberPrivateKey: formed.memberPrivateKey ?? null,
    Type: 'c',
    FounderOwnerKey: null,
  };
  rememberJoin(joinerRow);
  const joinedInst = await joiner.addStrand({ strandRow: joinerRow, sAppConfig: SAPP, founder: false });

  await founded.instance.database.getDatabase().exec(
    'insert into App.Member (Id, Name, AvatarUri) values (?, ?, ?)', ['host-1', 'Host', null]);
  log('HOST: wrote a Member');

  let sawIt = false;
  const untilP1 = Date.now() + 90_000;
  while (Date.now() < untilP1) {
    if (await countMembers(joinedInst) >= 1) { sawIt = true; break; }
    await new Promise(r => setTimeout(r, 3000));
  }
  log(sawIt ? 'PHASE 1 ✓ joiner read the host\'s row — formation path works'
            : 'PHASE 1 ✗ joiner never saw the host\'s row');

  // THE CONTROL FOR PHASE 2's MEASUREMENT, and it is not optional.
  //
  // Phase 2 concludes "the write did not cross" from the joiner never reaching 2
  // Member rows. That inference is only worth anything if a SECOND write crosses
  // when nothing has restarted — otherwise a harness that simply cannot observe
  // the second row would report a dramatic failure for every run. So: write a
  // second row here, before any restart, and require the joiner to see it.
  await founded.instance.database.getDatabase().exec(
    'insert into App.Member (Id, Name, AvatarUri) values (?, ?, ?)', ['host-2', 'Host Again', null]);
  let sawSecond = false;
  const untilCtl = Date.now() + 90_000;
  while (Date.now() < untilCtl) {
    if (await countMembers(joinedInst) >= 2) { sawSecond = true; break; }
    await new Promise(r => setTimeout(r, 3000));
  }
  log(sawSecond
    ? 'CONTROL ✓ a second write crosses before any restart — phase 2\'s measurement is meaningful'
    : 'CONTROL ✗ a second write does NOT cross even with nothing restarted — phase 2 would prove nothing');
  if (!sawSecond) {
    log('Stopping: the rig cannot observe a second write, so a phase 2 failure would be its own.');
    process.exit(5);
  }
  if (!sawIt) {
    log('Phase 1 failed, so phase 2 would prove nothing. Stopping.');
    process.exit(4);
  }

  // ─────────────────── PHASE 2: restart, re-attach ────────────────────
  log('');
  log('PHASE 2 — destroying both nodes and rebuilding them over the SAME storage');
  log('          (no formation this time — exactly a restarted phone)');
  await host.stop(); await joiner.stop();
  await closeDbs();
  host = null; joiner = null;
  await new Promise(r => setTimeout(r, 5000));

  host = await startParty('host', partyHost);
  joiner = await startParty('joiner', partyJoiner);
  const hostUp = await awaitReachable(host, 'HOST(restarted)');
  const joinerUp = await awaitReachable(joiner, 'JOINER(restarted)');
  if (!hostUp || !joinerUp) {
    log('!! a restarted party could not get a relay reservation — that alone is a finding.');
  }

  // The HOST rediscovers through its own control DB (the `strand:discovered`
  // subscription handles it). The JOINER cannot — so it re-adds from its
  // remembered-joins list, which is exactly what the app does on every start
  // (`reattachRememberedStrands`). Doing this by hand here is faithful, not a
  // shortcut: it is the same call the app makes with the same stored row.
  for (const row of rememberedJoins()) {
    try {
      await joiner.addStrand({ strandRow: row, sAppConfig: SAPP, founder: false });
      log(`joiner: re-added remembered strand ${row.Id}`);
    } catch (e) {
      log(`joiner: re-add of remembered ${row.Id} FAILED — ${e?.message ?? e}`);
    }
  }
  log('waiting for each side to rediscover and re-attach its strand…');
  const untilAttach = Date.now() + 120_000;
  let hostInst = null, joinerInst = null;
  while (Date.now() < untilAttach) {
    hostInst = strandOf(host, strandId);
    joinerInst = strandOf(joiner, strandId);
    if (hostInst?.database && joinerInst?.database) break;
    await new Promise(r => setTimeout(r, 5000));
  }
  log(`after restart: host strand ${hostInst ? hostInst.status : 'ABSENT'}, ` +
      `joiner strand ${joinerInst ? joinerInst.status : 'ABSENT'}`);

  // The question: can a write on one side still reach the other?
  const marker = `restart-${Date.now()}`;
  if (hostInst?.database) {
    try {
      await hostInst.database.getDatabase().exec(
        'insert into App.Member (Id, Name, AvatarUri) values (?, ?, ?)', [marker, 'After Restart', null]);
      log('HOST(restarted): wrote a new Member');
    } catch (e) { log(`HOST(restarted): write FAILED — ${e?.message ?? e}`); }
  } else {
    log('HOST(restarted): no writable database — cannot even write locally');
  }

  let crossed = false;
  const untilP2 = Date.now() + RECONVERGE_MS;
  while (Date.now() < untilP2) {
    const n = await countMembers(joinerInst ?? strandOf(joiner, strandId));
    log(`  joiner sees ${n} Member row(s)`);
    // 3 = the two written before the restart, plus the one written after it.
    if (n >= 3) { crossed = true; break; }
    await new Promise(r => setTimeout(r, 10_000));
  }

  log('');
  if (crossed) {
    log('PHASE 2 ✓ the restarted parties re-converged.');
    log('So the restart path is FINE in Node, and the device failure is not this.');
  } else {
    log('PHASE 2 ✗ the restarted parties did NOT re-converge.');
    log('Reproduced in pure Node, no React Native involved: two relay-only peers that');
    log('formed successfully cannot re-find each other after a restart.');
  }
  process.exitCode = crossed ? 0 : 1;
} catch (err) {
  log(`harness error: ${err?.stack ?? err}`);
  process.exitCode = 2;
} finally {
  try { await host?.stop(); } catch { /* best effort */ }
  try { await joiner?.stop(); } catch { /* best effort */ }
  await closeDbs();
}
