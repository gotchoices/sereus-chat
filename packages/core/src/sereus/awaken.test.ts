/**
 * After a return, strands come back one at a time, the one on screen first (`strands.awaken`),
 * and a strand left asleep is listed as asleep, not as connecting, and wakes when opened.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestParty, until, type TestParty } from '../testing/node-host.js';

function value<T>(r: { ok: true; value: T } | { ok: false; error: { kind: string; message: string } }): T {
  if (!r.ok) throw new Error(`${r.error.kind}: ${r.error.message}`);
  return r.value;
}

describe('waking strands after a return', () => {
  let a: TestParty, b: TestParty;
  const ids: string[] = [];

  beforeAll(async () => {
    // A writes in offline mode, as a phone does: a write waits in A's outbox while B is asleep.
    a = await createTestParty('aw-a', { listen: true, offline: true });
    // B visits a sleeping strand every second (the phone: 90 s).
    b = await createTestParty('aw-b', { listen: true, strandStart: { recentCount: 99, recentMs: 0, gapMs: 0, rotateMs: 1000 } });
    await a.boot(); await b.boot();
    for (let i = 0; i < 2; i++) {
      const inv = value(await a.model.invitations.create({ grantsInviteRight: false, visibility: 'private' }));
      const { strandId } = value(await b.model.invitations.accept(inv.token));
      await until(async () => {
        const s = await b.model.strands.list();
        return s.ok && s.value.some(x => x.id === strandId && !x.opening);
      }, 'the strand open at B', 120_000);
      ids.push(strandId);
    }
  }, 300_000);
  afterAll(async () => { await Promise.allSettled([a?.stop(), b?.stop()]); });

  it('lists a hibernated strand as asleep, and wakes the one named first', async () => {
    await b.node.hibernateAll();
    const listed = value(await b.model.strands.list()).filter(s => ids.includes(s.id));
    expect(listed.map(s => s.asleep)).toEqual([true, true]);
    expect(listed.some(s => s.opening)).toBe(false);

    const woke: string[] = [];
    let recording = true;
    b.node.on('strand:waking', ({ strandId }) => { if (recording) woke.push(strandId); });
    const result = value(await b.model.strands.awaken({ first: ids[1] }));
    recording = false;
    expect(woke[0]).toBe(ids[1]);
    expect(result.woken.sort()).toEqual([...ids].sort());
    expect(value(await b.model.strands.list()).filter(s => ids.includes(s.id)).some(s => s.asleep)).toBe(false);
  }, 180_000);

  it('a strand still asleep wakes when its messages are read', async () => {
    await b.node.hibernateStrand(ids[0]);
    value(await b.model.messages.list(ids[0]));
    expect(b.node.getStrands().get(ids[0])?.status).not.toBe('hibernating');
  }, 120_000);

  it('the rotation wakes a sleeping strand that has news, keeps it up, and puts a quiet one back to sleep', async () => {
    await b.node.hibernateAll();
    value(await a.model.messages.send(ids[0], { content: 'while you slept' }));
    b.model.strands.rotate(true);
    try {
      await until(async () => {
        const s = b.node.getStrands().get(ids[0]);
        if (!s?.database) return false;
        const msgs = await b.model.messages.list(ids[0]);
        return msgs.ok && msgs.value.some(m => m.content === 'while you slept');
      }, 'the news at B through a visit', 120_000);
      // The quiet one was visited and went back to sleep.
      await until(async () => b.node.getStrands().get(ids[1])?.status === 'hibernating', 'the quiet strand asleep again', 120_000);
      expect(b.node.getStrands().get(ids[0])?.status).not.toBe('hibernating');
    } finally {
      b.model.strands.rotate(false);
    }
  }, 300_000);
});
