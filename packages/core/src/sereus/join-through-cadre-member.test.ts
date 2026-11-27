/**
 * A join answered by the inviter's always-on machine alone: the case an invitation's bootstrap
 * list exists for, which sereus has no end-to-end test of (its backlog
 * `debt-join-through-a-sibling-machine-unscenarioed`).
 *
 * Alice claims a cadre member (a server-class node, every strand of her party as a replica) and
 * creates a private invitation. Once a commit of the new strand is held by another machine (what
 * cadre-client shows as ready to hand out), Alice stops altogether. Carol redeems the invitation with its bootstrap
 * list rewritten to name only the member, as cadre-client's list will when it names a person's
 * cadron: the join must be answered there.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestParty, startRelay, until, type TestParty } from '../testing/node-host.js';
import { claimCadreMember, type CadreMember } from '../testing/cadre-member.js';

function value<T>(result: { ok: true; value: T } | { ok: false; error: { kind: string; message: string } }): T {
  if (!result.ok) throw new Error(`${result.error.kind}: ${result.error.message}`);
  return result.value;
}
const note = (line: string) => process.stderr.write(`[join via member] ${line}\n`);

describe("a join answered by the inviter's cadre member while the inviter is off", () => {
  let relay: Awaited<ReturnType<typeof startRelay>>;
  let alice: TestParty, carol: TestParty | undefined;
  let member: CadreMember;

  beforeAll(async () => {
    relay = await startRelay();
    alice = await createTestParty('alice', { relayAddr: relay.addr });
    await alice.boot();
    await until(() => alice.node.getMultiaddrs().length > 0, 'Alice reachable');
    member = await claimCadreMember(relay.addr, alice, note);
  }, 300_000);
  afterAll(async () => {
    await Promise.allSettled([alice?.stop(), carol?.stop(), member?.stop()]);
    await relay?.stop();
  });

  it('Carol joins through an invitation naming only the cadre member', async () => {
    // READY: by default wait only for what the inviter can see itself, as a phone must: a commit
    // of the strand held by another machine (`strand:commit-held`, or `heldElsewhere`). The
    // member may still be starting then, but it holds the strand's data and finishes starting
    // without Alice. READY=member reads the member's own state instead (running, with the
    // invitation's row). Merely LISTED is not enough: 4 of 5 joins then failed
    // `host-strand-unavailable`, the member's runtime never live once Alice was gone.
    const inviterOnly = process.env.READY !== 'member';
    const held = new Set<string>();
    alice.node.on('strand:commit-durability', (d) => { if (d.heldElsewhere) held.add(d.strandId); });
    alice.node.on('strand:commit-held', (d) => { held.add(d.strandId); });
    const inv = value(await alice.model.invitations.create({ grantsInviteRight: false, visibility: 'private' }));
    const strandId = inv.strandId!;
    note(`invitation for strand ${strandId.slice(0, 8)}`);
    if (inviterOnly) {
      const t = Date.now();
      await until(() => held.has(strandId), 'a commit of the strand held by another machine, seen by Alice', 180_000);
      const inst = member.node.getStrands().get(strandId);
      note(`inviter-side ready ${Date.now() - t} ms after the invitation; the member is then ${inst?.status ?? 'not running it'}, database ${!!inst?.database}`);
    }

    const t0 = Date.now();
    if (!inviterOnly) await until(async () => {
      const inst = member.node.getStrands().get(strandId);
      if (inst?.status !== 'active' || !inst.database) return false;
      return (await member.node.getControlDatabase()?.queryFormationInvite(inv.id).catch(() => null)) != null;
    }, 'the strand running and the invitation on the cadre member', 180_000);
    note(`the member runs the strand and holds the invitation ${Date.now() - t0} ms after it was made`);

    const decoded = alice.node.decodeInvitation(inv.token);
    const onlyMember = alice.node.encodeInvitation({ ...decoded, bootstrap: member.directAddrs() });
    const memberId = member.node.peerId!.toString();
    note(`Alice's own list: ${decoded.bootstrap.length} address(es), ${decoded.bootstrap.filter(a => a.endsWith(memberId)).length} of them the member's; rewritten to the member's ${member.directAddrs().length}`);

    await alice.stop();
    note('Alice is off');

    carol = await createTestParty('carol', { relayAddr: relay.addr });
    await carol.boot();
    const t1 = Date.now();
    const joined = await carol.model.invitations.accept(onlyMember);
    if (!joined.ok) note(`the join failed: ${joined.error.kind}: ${joined.error.message}`);
    expect(joined.ok).toBe(true);
    note(`Carol joined in ${Date.now() - t1} ms`);
    expect(joined.ok && joined.value.strandId).toBe(strandId);

    // And the strand is Carol's to use: a message she sends reaches the member's replica.
    await until(async () => (await carol!.model.messages.send(strandId, { content: 'hello from Carol', replyToId: null })).ok,
      "Carol's first message", 120_000);
    note('Carol sent a message with Alice still off');
  }, 600_000);
});

describe("chat's own invitation, its addresses planned by cadre-client, answered by the cadre member", () => {
  let relay: Awaited<ReturnType<typeof startRelay>>;
  let alice: TestParty, dave: TestParty | undefined;
  let member: CadreMember;

  beforeAll(async () => {
    relay = await startRelay();
    alice = await createTestParty('alice', { relayAddr: relay.addr });
    await alice.boot();
    await until(() => alice.node.getMultiaddrs().length > 0, 'Alice reachable');
    member = await claimCadreMember(relay.addr, alice, note);
  }, 300_000);
  afterAll(async () => {
    await Promise.allSettled([alice?.stop(), dave?.stop(), member?.stop()]);
    await relay?.stop();
  });

  it('names the member, is ready to hand out, and Dave joins with Alice off', async () => {
    const memberId = member.node.peerId!.toString();
    // A cadron added a moment ago: its addresses here are loopback (dropped) until its record,
    // with its relayed address, reaches Alice.
    await until(async () => {
      const plan = await alice.model.cadrons.bootstrapPlan();
      return plan.ok && plan.value.entries.some(e => e.peerId === memberId);
    }, "the member in Alice's plan", 120_000);

    const inv = value(await alice.model.invitations.create({ grantsInviteRight: false, visibility: 'private' }));
    const strandId = inv.strandId!;
    expect(inv.newStrand).toBe(true);
    const decoded = alice.node.decodeInvitation(inv.token);
    note(`chat's invitation names: ${decoded.bootstrap.map(a => `${a.endsWith(memberId) ? 'member' : 'other'}(${a.includes('p2p-circuit') ? 'relay' : 'direct'})`).join(', ')}`);
    expect(decoded.bootstrap.length).toBeGreaterThan(0);
    expect(decoded.bootstrap.every(a => a.endsWith(memberId))).toBe(true);

    const described = value(await alice.model.cadrons.describe(inv.token, inv.url));
    note(`in words: ${described.addresses.map(a => `${a.label} ${a.kind} via ${a.via} ${a.host}:${a.port}`).join('; ')}; link ${described.linkLength} chars, QR v${described.qrVersion}`);

    const t0 = Date.now();
    await until(() => alice.model.cadrons.readiness(strandId, { newStrand: true }) === 'ready', 'ready to hand out', 180_000);
    note(`ready to hand out ${Date.now() - t0} ms after the invitation`);

    await alice.stop();
    dave = await createTestParty('dave', { relayAddr: relay.addr });
    await dave.boot();
    const t1 = Date.now();
    const joined = await dave.model.invitations.accept(inv.token);
    if (!joined.ok) note(`the join failed: ${joined.error.kind}: ${joined.error.message}`);
    expect(joined.ok && joined.value.strandId).toBe(strandId);
    note(`Dave joined in ${Date.now() - t1} ms with Alice off`);
  }, 600_000);
});
