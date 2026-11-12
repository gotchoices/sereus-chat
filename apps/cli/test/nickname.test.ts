/**
 * Private names (story 30), two people, real serchat processes through an in-test relay: Bob's
 * own name for Alice is what Bob sees, survives his restart, and never reaches the strand, so
 * Alice neither sees it nor holds it.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Person, scenarioHome, startRelay, stopAllBackground, type Row } from './harness.js';

let relay: Awaited<ReturnType<typeof startRelay>>;
let home: Awaited<ReturnType<typeof scenarioHome>>;

beforeAll(async () => {
  relay = await startRelay();
  home = await scenarioHome();
});
afterEach(stopAllBackground);
afterAll(async () => {
  await relay?.stop();
  await home?.remove();
});

const text = (row: Row) => row.text as string;

describe('private names, two people through a relay', () => {
  it("Bob's name for Alice and Alice's note on the strand are each their own, and they last", async () => {
    const alice = new Person('nalice', home.dir);
    const bob = new Person('nbob', home.dir);
    await Promise.all([alice.setUp(relay.addr), bob.setUp(relay.addr)]);

    // Her own note on the new strand: who it is for. Private to her machines.
    const aliceUp = alice.start('invite', '--note', 'for Bob, about the lease', ';', 'tail', '--all');
    const invite = await aliceUp.waitForRow(r => typeof r.url === 'string', 'the invitation');
    await aliceUp.waitForNote('following');
    const [joined] = await bob.ok('join', invite.url as string, '--yes', ';', 'strands', ';', 'send', '1', 'hello from bob');
    const strandId = joined.strandId as string;
    await aliceUp.waitForRow(r => text(r) === 'hello from bob', "bob's hello at alice");
    await aliceUp.stop();

    const others = (await bob.ok('members', strandId)).filter(m => m.me === false);
    expect(others).toHaveLength(1);
    const aliceId = others[0].memberId as string;
    const aliceOwnName = others[0].ownName as string;

    await bob.ok('nickname', strandId, aliceId, 'Mom');
    const afterRestart = await bob.ok('members', strandId);
    const named = afterRestart.find(m => m.memberId === aliceId)!;
    expect(named.name, "Bob's name for her, after a restart").toBe('Mom');
    expect(named.ownName).toBe(aliceOwnName);
    expect((await bob.ok('nicknames')).map(r => r.name)).toContain('Mom');
    expect((await bob.ok('strands')).find(s => s.id === strandId)?.title, 'the strand titled by it').toBe('Mom');

    // Alice: her own name, and the strand's data holds no trace of Bob's.
    const aliceSees = await alice.ok('members', strandId);
    expect(aliceSees.map(m => m.name)).not.toContain('Mom');
    const strandRows = await alice.ok('sql', strandId, 'select Id, Name from App.Member');
    expect(JSON.stringify(strandRows)).not.toContain('Mom');

    // Alice's note: in her list and through `note`; nowhere on Bob's side or in the strand.
    expect((await alice.ok('strands')).find(s => s.id === strandId)?.note, "Alice's note on her strand").toBe('for Bob, about the lease');
    expect((await alice.ok('note', strandId))[0].note).toBe('for Bob, about the lease');
    expect((await bob.ok('strands')).find(s => s.id === strandId)?.note ?? '', 'not at Bob').toBe('');
    expect(JSON.stringify(await bob.ok('sql', strandId, 'select * from App.Message'))).not.toContain('lease');
    await alice.ok('note', strandId, '--clear');
    expect((await alice.ok('note', strandId))[0].note).toBe('');

    await bob.ok('nickname', strandId, aliceId, '--clear');
    expect((await bob.ok('members', strandId)).find(m => m.memberId === aliceId)?.name).toBe(aliceOwnName);
  }, 600_000);
});
