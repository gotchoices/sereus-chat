/**
 * A join answered by the inviter's always-on machine alone: the case an invitation's bootstrap
 * list exists for, which sereus has no end-to-end test of (its backlog
 * `debt-join-through-a-sibling-machine-unscenarioed`).
 *
 * Alice claims a cadre member (a server-class node, every strand of her party as a replica) and
 * creates a private invitation. Once the member runs the strand and holds the invitation's
 * `FormationInvite` row, Alice stops altogether. Carol redeems the invitation with its bootstrap
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
    const inv = value(await alice.model.invitations.create({ grantsInviteRight: false, visibility: 'private' }));
    const strandId = inv.strandId!;
    note(`invitation for strand ${strandId.slice(0, 8)}`);

    // What the member must hold before Alice can go: the strand RUNNING (listed is not enough: a
    // new strand's replica is still starting until its first sync from Alice, and a responder
    // whose runtime is not live refuses with `host-strand-unavailable`), and the invitation's row.
    const t0 = Date.now();
    await until(async () => {
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
