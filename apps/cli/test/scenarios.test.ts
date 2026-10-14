/**
 * Two-person scenarios with real serchat processes through an in-test relay — the
 * invite/join/send paths every chat app depends on. `yarn workspace serchat scenarios`
 * (bundles first). Slow by nature: each step starts a node.
 *
 * A known bug is written as the CORRECT behaviour and marked `it.fails`, naming the step
 * that fixes it; the run then says so when it flips.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Person, scenarioHome, startRelay, stopAllBackground, type Row } from './harness.js';

let relay: Awaited<ReturnType<typeof startRelay>>;
let home: Awaited<ReturnType<typeof scenarioHome>>;
let people = 0;

beforeAll(async () => {
  relay = await startRelay();
  home = await scenarioHome();
});

afterEach(stopAllBackground);

afterAll(async () => {
  await relay?.stop();
  await home?.remove();
});

/** Two new people, both with a name and the relay. Profile names are unique per scenario. */
async function twoPeople(): Promise<[Person, Person]> {
  const n = ++people;
  const alice = new Person(`alice${n}`, home.dir);
  const bob = new Person(`bob${n}`, home.dir);
  await Promise.all([alice.setUp(relay.addr), bob.setUp(relay.addr)]);
  return [alice, bob];
}

const text = (row: Row) => row.text as string;

describe('two people through a relay', () => {
  it('invite, join and talk both ways; the inviter restarts in between', async () => {
    const [alice, bob] = await twoPeople();

    // Alice invites and follows the new strand in one running process.
    const aliceTail = alice.start('invite', ';', 'tail', '--all');
    const invite = await aliceTail.waitForRow(r => typeof r.url === 'string', 'the invitation');
    await aliceTail.waitForNote('following');

    // Bob joins, lists, sends.
    const bobRows = await bob.ok('join', invite.url as string, '--yes', ';', 'strands', ';', 'send', '1', 'hello from bob');
    const strandId = bobRows[0].strandId as string;
    expect(strandId).toBeTruthy();
    expect(bobRows.find(r => r.row === 1)?.id).toBe(strandId);

    const received = await aliceTail.waitForRow(r => text(r) === 'hello from bob', "bob's message at alice");
    expect(received.from).toBe(bob.name);
    expect(received.strandId).toBe(strandId);
    await aliceTail.stop();

    // Alice's process is gone; a new one (a restart) sends while Bob follows.
    const bobTail = bob.start('tail', strandId);
    await bobTail.waitForNote('following');
    await alice.ok('send', strandId, 'hello from alice, restarted');
    const back = await bobTail.waitForRow(r => text(r) === 'hello from alice, restarted', "alice's message at bob");
    expect(back.from).toBe(alice.name);
    await bobTail.stop();

    // Both logs hold both messages, oldest first.
    const log = await bob.ok('log', strandId);
    expect(log.map(text)).toEqual(['hello from bob', 'hello from alice, restarted']);
  }, 600_000);

  it('a join while the inviter is offline fails as retryable, and succeeds once the inviter is back', async () => {
    const [alice, bob] = await twoPeople();
    const [invite] = await alice.ok('invite');

    const early = await bob.run('join', invite.url as string, '--yes');
    expect(early.code, `join with the inviter offline: ${early.stderr}`).toBe(3); // retryable

    const aliceUp = alice.start('idle');
    await aliceUp.waitForNote('idle;');
    const [joined] = await bob.ok('join', invite.url as string, '--yes');
    expect(joined.strandId).toBeTruthy();
    await aliceUp.stop();
  }, 600_000);

  // Phase 7b, step 5: `leave` unpublishes a Strand row a joined strand does not have, so the
  // party-wide JoinedStrand row survives and the strand is offered again (docs/serchat.md).
  it.fails('a strand Bob left stays left after he restarts', async () => {
    const [alice, bob] = await twoPeople();
    const aliceUp = alice.start('invite', ';', 'idle');
    const invite = await aliceUp.waitForRow(r => typeof r.url === 'string', 'the invitation');
    const [joined] = await bob.ok('join', invite.url as string, '--yes');
    const strandId = joined.strandId as string;
    // Let Bob's node run past a reconcile pass (every 15 s), which is when an owner machine
    // publishes a join party-wide (the JoinedStrand row the leave has to remove).
    const bobUp = bob.start('idle');
    await bobUp.waitForNote('idle;');
    await new Promise(r => setTimeout(r, 40_000));
    await bobUp.stop();

    await bob.ok('leave', strandId, '--yes');
    expect((await bob.ok('strands', '--all')).map(r => r.id)).not.toContain(strandId);
    // Restarted and left running long enough for anything the cadre still records to be
    // offered again (rediscovery takes ~18 s); it saves its list on the way out.
    const bobAgain = bob.start('idle');
    await bobAgain.waitForNote('idle;');
    await new Promise(r => setTimeout(r, 40_000));
    await bobAgain.stop();
    expect((await bob.ok('strands', '--all')).map(r => r.id)).not.toContain(strandId);
    await aliceUp.stop();
  }, 600_000);
});
