/**
 * Strand offline mode, two people, real serchat processes through an in-test relay. What the
 * phones now depend on: a write saved here while the other side is down reaches them once
 * they are back, exactly once, and both sides end with the same conversation. A write the
 * others refuse is reported, not lost silently.
 *
 * `--offline` turns the mode on per person; `--drain 0` lets a one-shot run exit with its
 * writes still queued (the next run of that profile sends them).
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

async function twoPeople(aliceExtra: string[], bobExtra: string[]): Promise<[Person, Person]> {
  const n = ++people;
  const alice = new Person(`oalice${n}`, home.dir, aliceExtra);
  const bob = new Person(`obob${n}`, home.dir, bobExtra);
  await Promise.all([alice.setUp(relay.addr), bob.setUp(relay.addr)]);
  return [alice, bob];
}

const text = (row: Row) => row.text as string;
const note = (line: string) => process.stderr.write(`[offline scenario] ${line}\n`);

/** Alice invites, Bob joins and says hello, Alice sees it; then both are stopped. */
async function joined(alice: Person, bob: Person): Promise<string> {
  const aliceUp = alice.start('invite', ';', 'tail', '--all');
  const invite = await aliceUp.waitForRow(r => typeof r.url === 'string', 'the invitation');
  await aliceUp.waitForNote('following');
  const rows = await bob.ok('join', invite.url as string, '--yes', ';', 'strands', ';', 'send', '1', 'hello from bob');
  const strandId = rows[0].strandId as string;
  await aliceUp.waitForRow(r => text(r) === 'hello from bob', "bob's hello at alice");
  await aliceUp.stop();
  return strandId;
}

function counts(log: Row[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of log) m.set(text(r), (m.get(text(r)) ?? 0) + 1);
  return m;
}

describe('offline mode, two people through a relay', () => {
  it('both write while apart; after reconnecting each holds every message once, in the same order', async () => {
    const [alice, bob] = await twoPeople(['--offline'], ['--offline']);
    const strandId = await joined(alice, bob);

    // Apart: each writes while the other is down, and exits with the writes still queued.
    const aSent = await alice.with('--drain', '0').ok('send', strandId, 'a1 apart', ';', 'send', strandId, 'a2 apart');
    const bSent = await bob.with('--drain', '0').ok('send', strandId, 'b1 apart', ';', 'send', strandId, 'b2 apart');
    note(`apart, alice's sends: ${aSent.map(r => `${text(r)}=${String(r.delivery)}`).join(', ')}; bob's: ${bSent.map(r => `${text(r)}=${String(r.delivery)}`).join(', ')}`);

    // Together again: both run, in windows, until their logs agree. (`tail` would miss messages
    // that arrive before it starts, which a queue that drains at start-up does.)
    const want = ['hello from bob', 'a1 apart', 'a2 apart', 'b1 apart', 'b2 apart'];
    const t0 = Date.now();
    let windows = 0;
    for (;;) {
      windows++;
      const aliceUp = alice.start('idle');
      const bobUp = bob.start('idle');
      await new Promise(r => setTimeout(r, 20_000));
      await Promise.all([aliceUp.stop(), bobUp.stop()]);
      const a = (await alice.with('--drain', '0').ok('log', strandId)).map(text);
      const b = (await bob.with('--drain', '0').ok('log', strandId)).map(text);
      if (want.every(t => a.includes(t) && b.includes(t))) break;
      if (Date.now() - t0 > 300_000) throw new Error(`not converged after 5 min: alice ${a.join(' | ')}; bob ${b.join(' | ')}`);
    }
    note(`converged within ${windows} window(s) of 20 s (${((Date.now() - t0) / 1000).toFixed(0)} s with restarts)`);

    const aliceLog = await alice.ok('log', strandId);
    const bobLog = await bob.ok('log', strandId);
    for (const [who, log] of [['alice', aliceLog], ['bob', bobLog]] as const) {
      const c = counts(log);
      for (const t of ['hello from bob', 'a1 apart', 'a2 apart', 'b1 apart', 'b2 apart']) {
        expect(c.get(t), `${who} holds "${t}" exactly once`).toBe(1);
      }
    }
    expect(aliceLog.map(r => r.messageId), 'the same messages in the same order').toEqual(bobLog.map(r => r.messageId));
    // Each person's messages in the order they were sent, even within one second.
    const order = aliceLog.map(text);
    expect(order.indexOf('a1 apart'), 'a1 before a2').toBeLessThan(order.indexOf('a2 apart'));
    expect(order.indexOf('b1 apart'), 'b1 before b2').toBeLessThan(order.indexOf('b2 apart'));
  }, 900_000);

  it('a queued reaction to a message deleted meanwhile: both sides end the same, and a refusal is reported', async () => {
    const [alice, bob] = await twoPeople(['--offline'], ['--offline']);
    const strandId = await joined(alice, bob);
    const [hello] = (await bob.ok('log', strandId)).filter(r => text(r) === 'hello from bob');

    // Apart: Bob deletes his message; Alice, who still sees it, reacts to it.
    await bob.with('--drain', '0').ok('delete', strandId, hello.messageId as string);
    await alice.with('--drain', '0').ok('react', strandId, hello.messageId as string, '👍');

    const aliceUp = alice.start('idle');
    const bobUp = bob.start('idle');
    await Promise.all([aliceUp.waitForNote('idle;'), bobUp.waitForNote('idle;')]);
    // Let both queues send and settle.
    await new Promise(r => setTimeout(r, 60_000));
    await Promise.all([aliceUp.stop(), bobUp.stop()]);
    // One profile runs one process at a time: read the outboxes once the runs have stopped.
    const [aBox] = await alice.with('--drain', '0').ok('outbox', strandId);
    const [bBox] = await bob.with('--drain', '0').ok('outbox', strandId);
    note(`after reconnecting: alice outbox ${JSON.stringify(aBox)}; bob outbox ${JSON.stringify(bBox)}`);

    const aliceLog = await alice.ok('log', strandId);
    const bobLog = await bob.ok('log', strandId);
    note(`alice's log: ${aliceLog.map(text).join(' | ') || '(empty)'}; bob's: ${bobLog.map(text).join(' | ') || '(empty)'}`);
    expect(aliceLog.map(r => r.messageId), 'both sides end with the same messages').toEqual(bobLog.map(r => r.messageId));
    expect(Number(aBox.waiting) + Number(bBox.waiting), 'nothing still waiting').toBe(0);
    // Where Alice's reaction went: refused (reported above), or committed without its message.
    const q = 'select MessageId, MemberId, Symbol from App.Reaction';
    const aReactions = await alice.with('--drain', '0').ok('sql', strandId, q);
    const bReactions = await bob.with('--drain', '0').ok('sql', strandId, q);
    note(`reactions left: alice ${JSON.stringify(aReactions)}; bob ${JSON.stringify(bReactions)}`);
    expect(aReactions, 'both sides hold the same reactions').toEqual(bReactions);
  }, 900_000);

  it('offline-mode Alice and synchronous Bob: what Alice saved while Bob was down reaches him, and back', async () => {
    const [alice, bob] = await twoPeople(['--offline'], []);
    const strandId = await joined(alice, bob);

    await alice.with('--drain', '0').ok('send', strandId, 'saved while bob was down');
    const bobUp = bob.start('tail', strandId);
    await bobUp.waitForNote('following');
    const aliceUp = alice.start('tail', strandId);
    await bobUp.waitForRow(r => text(r) === 'saved while bob was down', "alice's queued write at bob", 300_000);
    await bobUp.stop(); // one profile, one process: Bob's send runs on its own
    await bob.ok('send', strandId, 'bob, synchronous');
    await aliceUp.waitForRow(r => text(r) === 'bob, synchronous', "bob's write at alice", 300_000);
    await aliceUp.stop();
  }, 900_000);
});
