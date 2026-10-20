/**
 * The two-party check: two whole parties in ONE process, relay-only, forming a closed strand
 * and replicating both ways. Written once (here) and run in Node and on a phone; the host
 * builds the nodes (`createNode`), so the runs differ only in the runtime.
 *
 * Originally the phone's in-app twin of `test/stack/two-party-formation.mjs`:
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

import { CadreNode, generateStrandMemberKey, InMemoryKeyStore, type StrandInstance } from '@serfab/cadre-core';
import { runOwnerGenesis } from '@serfab/cadre-core/edge-node';
import { CHAT_SAPP_ID, getChatSAppConfig } from '../protocol/index.js';

import type { CreateExtraNode } from '../sereus/host.js';

export interface TwoPartyPlatform {
  createNode: CreateExtraNode;
  relayAddrs: string[];
  /**
   * Stop the app's own node for the duration and return how to restart it. On a phone the
   * app's node and its strand would otherwise compete with the two test parties for one
   * loop, which changes the answer.
   */
  pauseApp?(): Promise<() => Promise<void>>;
}

export type TwoPartyResult = {
  ok: boolean;
  detail: string;
  /** What each side could see at the end — the whole point of the check. */
  hostSees?: { members: number; messages: number };
  joinerSees?: { members: number; messages: number };
  log: string[];
};

export type TwoPartyOptions = { timeoutMs?: number; onProgress?: (line: string) => void };

/** Counted by draining the iterator, as the Node harness counts. */
async function drain(db: { eval: (sql: string) => AsyncIterable<unknown> }, sql: string): Promise<number> {
  let n = 0;
  for await (const _ of db.eval(sql)) n += 1;
  return n;
}

/** Whether the two STRAND nodes ever found each other (not the control nodes). */
function strandPeers(instance: StrandInstance): { self: string | null; peers: string[] } {
  const node = instance.libp2pNode;
  if (!node) return { self: null, peers: [] };
  return { self: node.peerId.toString(), peers: node.getPeers().map(p => p.toString()) };
}

async function countRows(instance: StrandInstance): Promise<{ members: number; messages: number }> {
  const db = instance.database?.getDatabase?.();
  if (!db) return { members: -1, messages: -1 };
  return { members: await drain(db, 'select Id from App.Member'), messages: await drain(db, 'select Id from App.Message') };
}

export async function runTwoPartyCheck(platform: TwoPartyPlatform, opts: TwoPartyOptions = {}): Promise<TwoPartyResult> {
  const started = Date.now();
  const log: string[] = [];
  const say = (line: string) => {
    const stamped = `[${((Date.now() - started) / 1000).toFixed(1)}s] ${line}`;
    log.push(stamped);
    opts.onProgress?.(stamped);
  };
  const id = Math.random().toString(36).slice(2, 10);
  const nodes: CadreNode[] = [];
  let resumeApp: (() => Promise<void>) | null = null;

  const makeParty = async (tag: string): Promise<CadreNode> => {
    const node = await platform.createNode({ tag, partyId: `diag2-${id}-${tag}`, relayAddrs: platform.relayAddrs });
    nodes.push(node);
    // Owner genesis as cadre-core's edge node runs it; a throwaway party keeps its key in memory.
    const genesis = await runOwnerGenesis(node, { keyStore: new InMemoryKeyStore(), label: `diag ${tag}` });
    if (genesis !== 'enrolled') throw new Error(`${tag}: owner genesis did not enrol (${String(genesis)})`);
    say(`${tag}: started, ${node.getMultiaddrs().length} address(es)`);
    return node;
  };

  /**
   * Wait for a relay reservation to produce an address: an invitation minted before the
   * host has one names nowhere to dial, and the joiner would fail looking like the bug.
   */
  const awaitAddresses = async (node: CadreNode, tag: string, waitMs = 120_000) => {
    const until = Date.now() + waitMs;
    while (Date.now() < until) {
      if (node.getMultiaddrs().length > 0) return true;
      await new Promise<void>(r => setTimeout(() => r(), 1000));
    }
    const state = node.getRelayReservationState?.();
    say(`!! ${tag}: no relay reservation after ${waitMs / 1000}s` + (state
      ? ` — status ${state.status}, error ${state.error ?? 'none'}`
        + (state.retryAtMs ? `, retry in ${Math.max(0, Math.round((state.retryAtMs - Date.now()) / 1000))}s` : '')
      : ''));
    return false;
  };

  try {
    if (!platform.relayAddrs.length) {
      return { ok: false, detail: 'No relay configured — set one first; this check is about relay-only peers.', log };
    }
    say(`relay: ${platform.relayAddrs[0]}`);
    if (platform.pauseApp) {
      resumeApp = await platform.pauseApp();
      say('app node stopped for the duration — only the two test parties run');
    }

    // One at a time, reservation and all: two relay handshakes and Noise sessions on one
    // loop at once both missed the reservation deadline on a phone.
    const host = await makeParty('host');
    const hostReachable = await awaitAddresses(host, 'host');
    const joiner = await makeParty('joiner');
    await awaitAddresses(joiner, 'joiner');
    if (!hostReachable) {
      return { ok: false, detail: 'The host never got a relay reservation, so no join could succeed. That is a relay/reachability problem, not the cohort problem under test.', log };
    }
    say(`host: ${host.getMultiaddrs().length} addr(s) · joiner: ${joiner.getMultiaddrs().length} addr(s)`);

    // ── The host founds a closed strand and binds an invitation to it ──
    const strandId = `diag2-strand-${id}`;
    const memberPrivateKey = await generateStrandMemberKey();
    const sApp = getChatSAppConfig();
    const hostStrand = await host.foundStrand({ strandId, type: 'c', memberPrivateKey, sAppConfig: sApp });
    say(`host: founded ${strandId}, status ${hostStrand.instance.status}`);
    if (!hostStrand.strandRow.MemberPrivateKey) {
      return { ok: false, detail: 'Founded closed strand carries no MemberPrivateKey — invitation would be unusable.', log };
    }
    const invitation = await host.createOpenInvitation(CHAT_SAPP_ID, 60 * 60 * 1000);
    await host.publishFormationInvite(invitation.token, CHAT_SAPP_ID, { expiresAtMs: invitation.expiration.getTime(), strandId });
    say('host: invitation published');

    const hostDb = hostStrand.instance.database!.getDatabase();
    await hostDb.exec('insert into App.Member (Id, Name, AvatarUri) values (?, ?, ?)', ['host-1', 'Host Party', null]);
    await hostDb.exec(
      'insert into App.Message (Id, MemberId, Content, Timestamp, ReplyToId, EditedAt) values (?, ?, ?, ?, ?, ?)',
      [`m-${id}`, 'host-1', 'hello from the host party', new Date().toISOString(), null, null]);
    say('host: wrote a Member and a Message');

    // ── The joiner redeems it ──
    const result = await joiner.formStrand(invitation, {
      partyId: joiner.peerId?.toString(),
      purpose: 'two-party check',
      metadata: { app: CHAT_SAPP_ID },
    });
    say(result.strandId === strandId ? "joiner: bound to the host's strand" : `!! bound to ${result.strandId}, expected ${strandId} — the invite resolved UNBOUND`);
    const joined = await joiner.addStrand({
      strandRow: { Id: result.strandId, MemberPrivateKey: result.memberPrivateKey ?? null, Type: 'c', FounderOwnerKey: null, FounderPeerId: null },
      sAppConfig: sApp,
      founder: false,
    });
    say(`joiner: attached, database ${!!joined.database}`);
    await joined.database!.getDatabase().exec('insert into App.Member (Id, Name, AvatarUri) values (?, ?, ?)', ['joiner-1', 'Joiner Party', null]);
    say('joiner: registered itself as a Member');

    // ── Does anything cross? ──
    const deadline = Date.now() + (opts.timeoutMs ?? 180_000);
    let hostSees = { members: 0, messages: 0 };
    let joinerSees = { members: 0, messages: 0 };
    let sawEachOther = false; // sticky: a connection that existed and dropped still answers the question
    while (Date.now() < deadline) {
      hostSees = await countRows(hostStrand.instance);
      joinerSees = await countRows(joined);
      const hp = strandPeers(hostStrand.instance);
      const jp = strandPeers(joined);
      sawEachOther = sawEachOther || (!!jp.self && hp.peers.includes(jp.self)) || (!!hp.self && jp.peers.includes(hp.self));
      say(`host sees ${hostSees.members}M/${hostSees.messages}msg (${hp.peers.length} strand peer(s)) · `
        + `joiner sees ${joinerSees.members}M/${joinerSees.messages}msg (${jp.peers.length} strand peer(s))`
        + (sawEachOther ? ' · they have connected' : ''));
      if (hostSees.members >= 2 && joinerSees.members >= 2 && joinerSees.messages >= 1) break;
      await new Promise<void>(r => setTimeout(() => r(), 5000));
    }
    const converged = hostSees.members >= 2 && joinerSees.members >= 2 && joinerSees.messages >= 1;
    return {
      ok: converged,
      detail: converged
        ? 'Both parties converged inside one process — the cohort forms here.'
        : `Did NOT converge: host ${hostSees.members} member(s), joiner ${joinerSees.members} member(s)/${joinerSees.messages} message(s). `
          + (sawEachOther
            ? 'The two strand nodes DID connect, so this is not the cohort-of-one shape — replication failed with a peer available.'
            : 'The two strand nodes never connected — the same shape as two phones (Optimystic#23), reproducible in one process with no network between the parties.'),
      hostSees, joinerSees, log,
    };
  } catch (err) {
    const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    say(`✗ ${message}`);
    return { ok: false, detail: message, log };
  } finally {
    for (const n of nodes) { try { await n.stop(); } catch { /* best effort */ } }
    if (resumeApp) {
      // Always, including on the error path: leaving the app's node down would break the
      // strand list the user returns to.
      try { await resumeApp(); say('app node restarted'); }
      catch (err) { say(`!! app node failed to restart: ${err instanceof Error ? err.message : String(err)} — reopen the app`); }
    }
  }
}
