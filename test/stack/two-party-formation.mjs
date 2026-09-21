/**
 * Can two DIFFERENT parties form a strand through a relay, and does the joiner
 * actually receive the strand's data?
 *
 * This is the question two phones have been unable to answer. On device the
 * formation handshake now completes reliably, and the joiner still ends at
 * `StrandAwaitingFirstSyncError` — "no member of this strand has been reachable
 * since this machine joined" — even though the formation result carries four
 * perfectly good relayed addresses for the host's strand node. Everything around
 * that measurement is noisy: emulator NAT, `adb reverse` tunnels over USB, relay
 * reservations that drop and recover, UI taps that silently miss. We have spent
 * more time fighting the apparatus than reading it.
 *
 * So: both parties in ONE Node process on the machine that also runs the relay.
 * No NAT, no adb, no Hermes, no taps. Same cadre-core, same libp2p, same relay
 * the phones use.
 *
 *   PASS → the stack does this correctly and the defect is mobile-specific
 *          (RN, the emulator's networking, or the USB tunnel). That bounds the
 *          search to the device side and says the app's logic is sound.
 *   FAIL → we have the thing we have never been able to produce: a deterministic,
 *          scriptable reproduction with no device in it, which is what an
 *          upstream report needs to be actionable.
 *
 * Either answer is worth the run, which is the point.
 *
 * DELIBERATELY PHONE-SHAPED. Both nodes take `listenAddrs: []` and reach each
 * other only through `relayAddrs`, because a Node process that can listen would
 * dial directly and prove nothing about the path a phone has to take. This
 * mirrors upstream's `blind-relay-phone-to-phone-e2e.integration.ts` — which
 * passes in their suite — against our own relay build.
 *
 * HOST MODE (`--host`) runs only the host and stays alive, printing an invitation
 * in the same `sereus://invite/...` form the app mints. That lets a REAL DEVICE be
 * the joiner against a counterpart known to work — which is the next cut once
 * Node-to-Node passes: it removes the emulator and the `adb reverse` tunnel in one
 * step, so anything that still fails is React Native's.
 *
 * Usage:
 *   node two-party-formation.mjs            # both parties here (the full check)
 *   node two-party-formation.mjs --host     # host only; a device joins
 *   WS_SEND_DELAY_MS=200 node two-party-formation.mjs   # model a slow link
 *   CPU_SLOWDOWN=1 node two-party-formation.mjs         # model a slow device
 *   RELAY_ADDR=/ip4/127.0.0.1/tcp/4002/ws/p2p/12D3Koo... node two-party-formation.mjs
 *   FIRST_SYNC_TIMEOUT_MS=120000 node two-party-formation.mjs
 */
// FIRST: replaces the global WebSocket when WS_SEND_DELAY_MS is set, so every
// socket libp2p opens below is already slowed. A no-op otherwise.
import './ws-latency.mjs';
// Models a slow device's crypto CPU cost (CPU_SLOWDOWN). Must precede any node
// construction: noise copies its crypto method references when it is built.
import './cpu-cost.mjs';
import { CadreNode, ControlFormationUsageRecorder, generateStrandMemberKey } from '@serfab/cadre-core';
import { LevelDBRawStorage } from '@optimystic/db-p2p-storage-rn';
import { webSockets } from '@libp2p/websockets';
import { circuitRelayTransport } from '@libp2p/circuit-relay-v2';
import { generateKeyPair } from '@libp2p/crypto/keys';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { openTestDb } from './classic-level-driver.mjs';

const FIRST_SYNC_TIMEOUT_MS = Number(process.env.FIRST_SYNC_TIMEOUT_MS ?? 120_000);
const HOST_ONLY = process.argv.includes('--host');

/** The relay the phones use. Read from the running relay's log unless overridden. */
function resolveRelayAddr() {
  if (process.env.RELAY_ADDR) return process.env.RELAY_ADDR;
  const log = readFileSync(new URL('../../.relay-data/relay.log', import.meta.url), 'utf8');
  const line = log.split('\n').find(l => l.includes('/tcp/4002/ws/p2p/') && l.includes('127.0.0.1'));
  if (!line) throw new Error('No ws relay address in .relay-data/relay.log — is the relay running?');
  return line.trim();
}

/**
 * THE CHAT APP'S OWN sApp, read from the same file the app bundles.
 *
 * Not a lookalike: a device joining this host arrives with
 * `getChatSAppConfig()` — id `org.sereus.chat` and the DDL below — and cadre-core
 * matches strands by sApp. A harness with its own id and schema can only ever be
 * joined by itself, which is fine for the Node-to-Node run and useless the moment
 * a real device is the joiner.
 *
 * `extractInnerDDL` mirrors `apps/mobile/src/data/chat-sapp.ts`: StrandDatabase
 * re-wraps the DDL in `declare schema App { … }`, so it is handed the inner
 * declarations only.
 */
const CHAT_QSQL = readFileSync(
  new URL('../../design/specs/domain/chat-sapp.qsql', import.meta.url), 'utf8');

function extractInnerDDL(schemaSql) {
  return schemaSql
    .replace(/^\s*--[^\n]*\n/gm, '')
    .replace(/^declare\s+schema\s+\w+\s*\{/m, '')
    .replace(/\}\s*$/, '')
    .trim();
}

const SAPP = {
  id: 'org.sereus.chat',
  version: '0.1.0',
  schema: extractInnerDDL(CHAT_QSQL),
  signature: '',
  latencyHint: 'interactive',
};

const started = Date.now();
const since = () => `${((Date.now() - started) / 1000).toFixed(1)}s`;
const log = (...a) => console.log(`[${since()}]`, ...a);

const dbs = [];
function storageFor(tag) {
  return (strandId) => {
    const handle = openTestDb(`twoparty-${tag}-${strandId}`, 0);
    dbs.push(handle);
    return new LevelDBRawStorage(handle.db);
  };
}

/** A node shaped like a phone: cannot listen, reachable only through the relay. */
async function makeParty(tag, relayAddr) {
  const partyId = randomUUID();
  const privateKey = await generateKeyPair('Ed25519');

  const node = new CadreNode({
    privateKey,
    controlNetwork: { partyId, bootstrapNodes: [] },
    profile: 'transaction',
    strandFilter: { mode: 'all' },
    storage: { provider: storageFor(tag) },
    network: {
      transports: [webSockets(), circuitRelayTransport()],
      // A phone cannot listen. Naming a relay is what gives this node an address
      // at all, and it reaches the STRAND nodes too — the control node alone is
      // not enough for formation, which is the lesson that cost us a day.
      listenAddrs: [],
      relayAddrs: [relayAddr],
      // Fail-soft, as the app runs it: a dead relay should leave the node usable
      // and merely unreachable rather than aborting start().
      requireRelay: false,
      connectionGater: { denyDialMultiaddr: () => false },
    },
    hibernation: { enabled: false },
    requireSignedSchemas: false,
    // NODE config, not an `addStrand` option — an earlier version of this file
    // passed it to `addStrand`, where it is silently ignored, and every run
    // therefore used the 30 s default while claiming otherwise.
    strandFirstSync: { timeoutMs: FIRST_SYNC_TIMEOUT_MS },
  });

  await node.start();
  const { privateKeyB64, publicKeyB64 } = node.getIdentityOwnerKey();
  const control = node.getControlDatabase();
  if (!control) throw new Error(`${tag}: no control database after start`);
  await control.ensureOwnerKey(publicKeyB64);
  node.initializeSeedBootstrap(privateKeyB64);

  log(`${tag}: party ${partyId} peer ${node.peerId?.toString?.()}`);
  return node;
}

/** Wait until the node has a dialable address, or give up saying so. */
async function awaitReachable(node, tag, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const addrs = node.getMultiaddrs();
    if (addrs.length > 0) {
      log(`${tag}: reachable — ${addrs.length} address(es)`);
      return addrs;
    }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(`${tag}: no relay reservation within ${timeoutMs / 1000}s — nothing could reach it`);
}

let host, joiner;
let exitCode = 1;
try {
  const relayAddr = resolveRelayAddr();
  log('relay', relayAddr);

  host = await makeParty('HOST', relayAddr);
  await awaitReachable(host, 'HOST');
  if (!HOST_ONLY) {
    joiner = await makeParty('JOINER', relayAddr);
    await awaitReachable(joiner, 'JOINER');
  }

  // ── Host founds a CLOSED strand and binds an invitation to it ──────────────
  const strandId = randomUUID();
  const memberPrivateKey = await generateStrandMemberKey();
  log('HOST: founding closed strand', strandId);
  const founded = await host.foundStrand({
    strandId, type: 'c', memberPrivateKey, sAppConfig: SAPP,
  });
  if (!founded.strandRow.MemberPrivateKey) throw new Error('HOST: closed strand founded with no MemberPrivateKey');
  log('HOST: strand founded, status', founded.instance.status);

  // The RECORDER IS NOT OPTIONAL for a bound invitation. Without one that can
  // `resolveStrand`, cadre-core treats every invite as UNBOUND and falls back to
  // its provisioner — the responder then mints a BRAND NEW strand per joiner
  // instead of admitting them to the host's, returns no membership key and no
  // strand addresses, and the joiner waits out first sync against a strand whose
  // only other member does not exist. That is what this harness did on its first
  // run, and it is worth knowing the failure looks identical to the one on device.
  host.initializeStrandSolicitation({
    formationUsageRecorder: new ControlFormationUsageRecorder(host.getControlDatabase()),
  });
  const invitation = await host.createOpenInvitation(SAPP.id, 60 * 60 * 1000);
  await host.publishFormationInvite(invitation.token, SAPP.id, {
    expiresAtMs: invitation.expiration.getTime(),
    strandId,
  });
  log('HOST: invitation published, token', invitation.token);

  if (HOST_ONLY) {
    const encoded = host.encodeInvitation(invitation);
    console.log('\n  sereus://invite/' + encoded + '\n');
    log('HOST: waiting for a device to join — Ctrl-C to stop');
    host.on('strand:writable', ({ strandId: id }) => log('HOST: strand:writable', id));
    // Report what the strand actually holds, so a join that half-completes is
    // visible from this side rather than only as silence on the device.
    setInterval(async () => {
      try {
        const db = founded.instance.database?.getDatabase?.();
        if (!db) return log('HOST: strand has no database yet');
        let members = 0;
        for await (const _r of db.eval('select Id from App.Member')) members += 1;
        log(`HOST: ${members} Member row(s), ${host.getMultiaddrs().length} addr(s)`);
      } catch (err) {
        log('HOST: poll failed —', err?.message ?? String(err));
      }
    }, 15_000);
    await new Promise(() => {});
  }

  // ── Joiner redeems it ─────────────────────────────────────────────────────
  log('JOINER: forming strand…');
  const t0 = Date.now();
  const result = await joiner.formStrand(invitation, {
    partyId: joiner.peerId?.toString(),
    purpose: 'two-party formation check',
    metadata: { app: SAPP.id },
  });
  log(`JOINER: formation returned in ${Date.now() - t0}ms`);

  if (result.strandId !== strandId) {
    log(`JOINER: !! got strand ${result.strandId}, expected the host's ${strandId}`);
    log('JOINER: !! the invite resolved as UNBOUND — the responder provisioned a new strand');
  } else {
    log('JOINER: bound correctly to the host\'s strand');
  }

  const seed = result.strandAddrs ?? [];
  log(`JOINER: seed = ${seed.length} strand addr(s), memberKey=${!!result.memberPrivateKey}`);
  for (const a of seed) log('  seed:', a);
  if (seed.length === 0) log('  !! empty seed — the joiner has nowhere to dial');

  // ── The step that fails on device ─────────────────────────────────────────
  log(`JOINER: attaching strand (first-sync timeout ${FIRST_SYNC_TIMEOUT_MS / 1000}s)…`);
  const t1 = Date.now();
  const instance = await joiner.addStrand({
    strandRow: {
      Id: result.strandId,
      MemberPrivateKey: result.memberPrivateKey ?? null,
      Type: 'c',
      FounderOwnerKey: null,
    },
    sAppConfig: SAPP,
    founder: false,
  });
  log(`JOINER: ✓ FIRST SYNC COMPLETE in ${Date.now() - t1}ms — status ${instance.status}, database ${!!instance.database}`);

  // ── And can data actually cross? ──────────────────────────────────────────
  // `StrandInstance.database` is the strand's database WRAPPER; the Quereus
  // handle is one call further in, and the sApp's tables live under the `App`
  // schema cadre-core wraps the DDL in. Both are what `chat-operations.ts` does.
  const hostDb = founded.instance.database.getDatabase();
  const joinerDb = instance.database.getDatabase();

  await hostDb.exec(`insert into App.Member (Id, Name, AvatarUri) values (?, ?, ?)`,
    ['host-1', 'Host Party', '']);
  log('HOST: wrote a Member row');

  const deadline = Date.now() + 60_000;
  let seen = 0;
  while (Date.now() < deadline) {
    seen = 0;
    for await (const _row of joinerDb.eval(`select Id from App.Member`)) seen += 1;
    if (seen > 0) break;
    await new Promise(r => setTimeout(r, 1000));
  }
  if (seen > 0) {
    log(`JOINER: ✓ READ THE HOST'S ROW — ${seen} Member row(s). Two-party chat works in Node.`);
    exitCode = 0;
  } else {
    log('JOINER: ✗ attached and writable, but the host\'s row never arrived within 60s');
  }
} catch (err) {
  log('✗ FAILED:', err?.name ?? 'Error', '—', err?.message ?? String(err));
  if (err?.stack) console.log(err.stack.split('\n').slice(1, 6).join('\n'));
} finally {
  for (const n of [joiner, host]) { try { await n?.stop?.(); } catch { /* best effort */ } }
  for (const h of dbs) { try { await h.close?.(); } catch { /* best effort */ } }
  process.exit(exitCode);
}
