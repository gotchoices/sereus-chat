/**
 * two-party-check.ts — the Node two-party harness, run inside React Native.
 *
 * WHY THIS EXISTS. `test/stack/two-party-formation.mjs` forms a strand between
 * two parties and replicates both ways in seconds — in Node, in one process, and
 * (measured 2026-09-27) across two separate machines that can only reach each
 * other through a relay. Two PHONES on that same relay, with the same package
 * versions, never do: each one's `findCluster` answers with a cohort of itself
 * alone, neither ever dials the other, and nothing crosses
 * (gotchoices/Optimystic#23).
 *
 * Separation has been ruled out as the cause, so the remaining variable is this
 * runtime. This check removes every other one: BOTH parties run here, in one
 * process, on one device. If it fails, the fault is reachable without a second
 * phone, without a relay hop between two devices, and without any network
 * topology to argue about — which is the reproduction the issue needs. If it
 * PASSES, that is just as informative: it would mean one RN process can do what
 * two cannot, pointing at what happens between two devices rather than at the
 * runtime itself.
 *
 * WHAT A FAILURE HERE DOES AND DOES NOT PROVE. The two parties share one JS
 * event loop, which the two phones did not. That asymmetry only runs one way:
 * a PASS is conclusive (the runtime can do this, so look at what happens between
 * devices), while a FAILURE is suggestive rather than decisive, because loop
 * contention here is strictly worse than on either phone alone. `src/debug-bootstrap.js`
 * records how little it takes — console logging by itself starved the loop enough
 * to fail three clean joins in a row. So read a red result as "reproducible
 * without a second device", and keep the peer count below as the thing that says
 * WHICH failure it is.
 *
 * ISOLATION. Both parties get their own party id, their own keys and their own
 * LevelDB names under a `diag2-` prefix, so a run cannot disturb the user's
 * strands or be disturbed by them. It does use the configured relay, because
 * being relay-only is the condition under test.
 */
import { CadreNode, generateStrandMemberKey } from '@serfab/cadre-core';
import type { CadreNodeConfig, StrandInstance } from '@serfab/cadre-core';
import { generateKeyPair } from '@libp2p/crypto/keys';
import { webSockets } from '@libp2p/websockets';
import { circuitRelayTransport } from '@libp2p/circuit-relay-v2';
import { LevelDBRawStorage, openOptimysticRNDb } from '@optimystic/db-p2p-storage-rn';
import { LevelDB, LevelDBWriteBatch } from 'rn-leveldb';
import { getChatSAppConfig, CHAT_SAPP_ID } from '../data/chat-sapp';
import { getPrefs } from '../data/adapter';
import { cadreService } from '../cadre/CadreService';
import { buildNoiseCrypto, DEFAULT_NOISE_CRYPTO_MODE } from '@serfab/cadre-rn/noise-crypto';

export type TwoPartyResult = {
  ok: boolean;
  detail: string;
  /** What each side could see at the end — the whole point of the check. */
  hostSees?: { members: number; messages: number };
  joinerSees?: { members: number; messages: number };
  log: string[];
};

export type TwoPartyOptions = {
  timeoutMs?: number;
  onProgress?: (line: string) => void;
};

function runId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export async function runTwoPartyCheck(opts: TwoPartyOptions = {}): Promise<TwoPartyResult> {
  const started = Date.now();
  const log: string[] = [];
  const say = (line: string) => {
    const stamped = `[${((Date.now() - started) / 1000).toFixed(1)}s] ${line}`;
    log.push(stamped);
    opts.onProgress?.(stamped);
    console.info('[two-party]', stamped);
  };

  const id = runId();
  const dbs = new Map<string, ReturnType<typeof openOptimysticRNDb>>();
  const storageFor = (tag: string) => (strandId: string) => {
    const name = `diag2-${id}-${tag}-${strandId}`;
    let db = dbs.get(name);
    if (!db) {
      db = openOptimysticRNDb({
        openFn: (n: string, createIfMissing: boolean, errorIfExists: boolean) =>
          new LevelDB(n, createIfMissing, errorIfExists),
        WriteBatch: LevelDBWriteBatch,
        name,
      });
      dbs.set(name, db);
    }
    return new LevelDBRawStorage(db);
  };

  const nodes: CadreNode[] = [];
  let appWasStopped = false;
  const makeParty = async (tag: string, relayAddrs: string[]): Promise<CadreNode> => {
    const privateKey = await generateKeyPair('Ed25519');
    const partyId = `diag2-${id}-${tag}`;
    const config = {
      privateKey,
      controlNetwork: { partyId, bootstrapNodes: [] },
      profile: 'transaction',
      strandFilter: { mode: 'all' },
      storage: { provider: storageFor(tag) },
      network: {
        transports: [webSockets(), circuitRelayTransport()],
        // A phone cannot listen; the relay is the only way in. This is the
        // condition under test, not an incidental setting.
        listenAddrs: [],
        relayAddrs,
        noiseCrypto: buildNoiseCrypto(DEFAULT_NOISE_CRYPTO_MODE),
        // Fail-soft, as the app is: `start()` may return before the first
        // reservation lands, which is precisely why `awaitAddresses` exists.
        requireRelay: false,
        // DECLARED, not measured, and deliberately above the 2000 ms default.
        // Every relay deadline is counted in round trips rather than milliseconds
        // (`link-budget.ts`), so this one number sets the reservation budget:
        // 4 x this. At the default, both parties timed out at exactly 8033 ms
        // while the app's own node reserved in 4043 ms — the difference being
        // that this check runs a THIRD and FOURTH node on a device already
        // running one, and the extra contention lands on the same budget as a
        // slow link would. Declaring a worse link is the sanctioned way to say so.
        linkRoundTripMs: 6000,
      },
      hibernation: { enabled: false },
      requireSignedSchemas: false,
    } as unknown as CadreNodeConfig;

    const node = new CadreNode(config);
    await node.start();
    nodes.push(node);
    const owner = node.getIdentityOwnerKey();
    const control = node.getControlDatabase();
    if (!control) throw new Error(`${tag}: no control database after start`);
    await control.ensureOwnerKey(owner.publicKeyB64);
    node.initializeSeedBootstrap(owner.privateKeyB64);
    say(`${tag}: started, ${node.getMultiaddrs().length} address(es)`);
    return node;
  };

  /**
   * Wait for a relay reservation to produce an address.
   *
   * An invitation minted before the host has an address names nowhere to dial,
   * so the joiner would fail looking like the bug under test.
   */
  const awaitAddresses = async (node: CadreNode, tag: string, waitMs = 120_000) => {
    const until = Date.now() + waitMs;
    while (Date.now() < until) {
      if (node.getMultiaddrs().length > 0) return true;
      await new Promise(r => setTimeout(r, 1000));
    }
    // Say WHY, not just that it did not happen. The supervisor records the
    // failure and when it will try again, and those two facts separate "the
    // relay refused us" from "we ran out of budget and are still retrying" —
    // which look identical from an empty address list.
    const state = node.getRelayReservationState?.();
    say(`!! ${tag}: no relay reservation after ${waitMs / 1000}s` +
        (state
          ? ` — status ${state.status}, error ${state.error ?? 'none'}` +
            (state.retryAtMs ? `, retry in ${Math.max(0, Math.round((state.retryAtMs - Date.now()) / 1000))}s` : '')
          : ''));
    return false;
  };

  /**
   * Counted by draining the iterator, not with `count(*)` — the same way the Node
   * harness counts, so the two runs are measuring the same thing. The rows
   * themselves are never wanted, only whether they arrived.
   */
  const drain = async (db: { eval: (sql: string) => AsyncIterable<unknown> }, sql: string) => {
    const it = db.eval(sql)[Symbol.asyncIterator]();
    let n = 0;
    for (let step = await it.next(); !step.done; step = await it.next()) n += 1;
    return n;
  };

  /**
   * Whether the two STRAND nodes ever found each other.
   *
   * This is the log-free version of the signal that identified #23. Between two
   * phones, each side's `findCluster` answered with a cohort of itself alone and
   * neither ever dialled the other, so every read took `cluster-fetch:solo-self-skip`
   * and nothing crossed. Reading `libp2pNode.getPeers()` says the same thing
   * without turning on `debug` — which matters, because the stack's own tracing
   * floods the RN bridge hard enough to change the result it is observing (see
   * `src/debug-bootstrap.js`).
   *
   * Note this is the strand node, not the control node: the two parties are
   * expected to meet on the control network regardless, and the question is
   * whether that ever becomes a strand-level connection.
   */
  const strandPeers = (instance: StrandInstance) => {
    const node = instance.libp2pNode;
    if (!node) return { self: null, peers: [] as string[] };
    return {
      self: node.peerId.toString(),
      peers: node.getPeers().map(p => p.toString()),
    };
  };

  const countRows = async (instance: StrandInstance) => {
    const db = instance.database?.getDatabase?.();
    if (!db) return { members: -1, messages: -1 };
    return {
      members: await drain(db, 'select Id from App.Member'),
      messages: await drain(db, 'select Id from App.Message'),
    };
  };

  try {
    const { relayAddrs } = await getPrefs();
    if (!relayAddrs?.length) {
      return { ok: false, detail: 'No relay configured — set one first; this check is about relay-only peers.', log };
    }
    say(`relay: ${relayAddrs[0]}`);

    // STOP THE APP'S OWN NODE FIRST, and restart it in `finally`.
    //
    // Without this the device runs FOUR cadre nodes — the app's, its strand's,
    // and this check's two — and the contention is not incidental: at the default
    // budget both parties missed the relay reservation at exactly 8033 ms while
    // the app's own node had reserved in 4043 ms. It also makes the comparison
    // wrong in a way that would invalidate the answer. The claim under test is
    // "two nodes, one runtime" against "two nodes, two devices"; leaving the app
    // running compares two nodes on two devices with four on one.
    appWasStopped = true;
    await cadreService.stop();
    say('app node stopped for the duration — this device now runs only the two test parties');

    // ONE AT A TIME, reservation and all. Bringing both up together put two
    // relay handshakes and two Noise sessions on one JS loop at once, and both
    // missed the reservation deadline; staggering them keeps the contention to
    // what a single extra node costs.
    const host = await makeParty('host', relayAddrs);
    const hostReachable = await awaitAddresses(host, 'host');
    const joiner = await makeParty('joiner', relayAddrs);
    await awaitAddresses(joiner, 'joiner');
    if (!hostReachable) {
      return {
        ok: false,
        detail: 'The host never got a relay reservation, so no join could succeed. ' +
          'That is a relay/reachability problem, not the cohort problem under test.',
        log,
      };
    }
    say(`host: ${host.getMultiaddrs().length} addr(s) · joiner: ${joiner.getMultiaddrs().length} addr(s)`);

    // ── Host founds a closed strand and binds an invitation to it ───────────
    const strandId = `diag2-strand-${id}`;
    const memberPrivateKey = await generateStrandMemberKey();
    const sApp = getChatSAppConfig();
    const hostStrand = await host.foundStrand({ strandId, type: 'c', memberPrivateKey, sAppConfig: sApp });
    say(`host: founded ${strandId}, status ${hostStrand.instance.status}`);
    if (!hostStrand.strandRow.MemberPrivateKey) {
      // Same guard as `createChatStrand`, for the same reason: a closed strand
      // with no membership key can issue no usable invitation, and without this
      // the run would fail later, on the joiner, looking like the bug under test.
      return { ok: false, detail: 'Founded closed strand carries no MemberPrivateKey — invitation would be unusable.', log };
    }

    // No responder to install: since sereus 1.10 `start()` installs one backed
    // by the control DB's FormationInvite/FormationUsage rows, which is what
    // binds the invitation to this strand.
    const invitation = await host.createOpenInvitation(CHAT_SAPP_ID, 60 * 60 * 1000);
    await host.publishFormationInvite(invitation.token, CHAT_SAPP_ID, {
      expiresAtMs: invitation.expiration.getTime(),
      strandId,
    });
    say('host: invitation published');

    const hostDb = hostStrand.instance.database!.getDatabase();
    await hostDb.exec('insert into App.Member (Id, Name, AvatarUri) values (?, ?, ?)',
      ['host-1', 'Host Party', null]);
    await hostDb.exec(
      `insert into App.Message (Id, MemberId, Content, Timestamp, ReplyToId, EditedAt)
       values (?, ?, ?, ?, ?, ?)`,
      [`m-${id}`, 'host-1', 'hello from the host party', new Date().toISOString(), null, null]);
    say('host: wrote a Member and a Message');

    // ── Joiner redeems it ──────────────────────────────────────────────────
    const result = await joiner.formStrand(invitation, {
      partyId: joiner.peerId?.toString(),
      purpose: 'in-app two-party check',
      metadata: { app: CHAT_SAPP_ID },
    });
    if (result.strandId !== strandId) {
      say(`!! bound to ${result.strandId}, expected ${strandId} — the invite resolved UNBOUND`);
    } else {
      say('joiner: bound to the host\'s strand');
    }

    const joined = await joiner.addStrand({
      strandRow: {
        Id: result.strandId,
        MemberPrivateKey: result.memberPrivateKey ?? null,
        Type: 'c',
        FounderOwnerKey: null,
      },
      sAppConfig: sApp,
      founder: false,
    });
    say(`joiner: attached, database ${!!joined.database}`);

    const joinerDb = joined.database!.getDatabase();
    await joinerDb.exec('insert into App.Member (Id, Name, AvatarUri) values (?, ?, ?)',
      ['joiner-1', 'Joiner Party', null]);
    say('joiner: registered itself as a Member');

    // ── Does anything cross? ───────────────────────────────────────────────
    const deadline = Date.now() + (opts.timeoutMs ?? 180_000);
    let hostSees = { members: 0, messages: 0 };
    let joinerSees = { members: 0, messages: 0 };
    // Sticky: a connection that existed and dropped still answers the question.
    let sawEachOther = false;
    while (Date.now() < deadline) {
      hostSees = await countRows(hostStrand.instance);
      joinerSees = await countRows(joined);
      const hp = strandPeers(hostStrand.instance);
      const jp = strandPeers(joined);
      sawEachOther = sawEachOther ||
        (!!jp.self && hp.peers.includes(jp.self)) || (!!hp.self && jp.peers.includes(hp.self));
      say(`host sees ${hostSees.members}M/${hostSees.messages}msg (${hp.peers.length} strand peer(s)) · ` +
          `joiner sees ${joinerSees.members}M/${joinerSees.messages}msg (${jp.peers.length} strand peer(s))` +
          (sawEachOther ? ' · they have connected' : ''));
      // Converged: each side holds both membership rows and the host's message.
      if (hostSees.members >= 2 && joinerSees.members >= 2 && joinerSees.messages >= 1) break;
      await new Promise(r => setTimeout(r, 5000));
    }

    const converged = hostSees.members >= 2 && joinerSees.members >= 2 && joinerSees.messages >= 1;
    return {
      ok: converged,
      detail: converged
        ? 'Both parties converged inside one RN process — the cohort forms here.'
        : `Did NOT converge: host ${hostSees.members} member(s), joiner ${joinerSees.members} member(s)/${joinerSees.messages} message(s). ` +
          (sawEachOther
            ? 'The two strand nodes DID connect, so this is not the cohort-of-one shape — replication failed with a peer available.'
            : 'The two strand nodes never connected — the same shape as two phones (Optimystic#23), ' +
              'now reproducible on one device with no network between the parties.'),
      hostSees, joinerSees, log,
    };
  } catch (err) {
    const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    say(`✗ ${message}`);
    return { ok: false, detail: message, log };
  } finally {
    for (const n of nodes) { try { await n.stop?.(); } catch { /* best effort */ } }
    if (appWasStopped) {
      // Always, including on the error path — leaving the app's node down would
      // silently break the strand list the user returns to.
      try {
        await cadreService.ensureStarted();
        say('app node restarted');
      } catch (err) {
        say(`!! app node failed to restart: ${err instanceof Error ? err.message : String(err)} — reopen the app`);
      }
    }
    for (const db of dbs.values()) {
      try { (db as unknown as { close?: () => void }).close?.(); } catch { /* best effort */ }
    }
  }
}
