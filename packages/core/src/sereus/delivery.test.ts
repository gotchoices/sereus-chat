/**
 * Where this device's writes stand (`delivery.ts`), in both of the stack's modes, on two
 * parties in this process (loopback).
 */
import { describe, expect, it } from 'vitest';
import { createTestParty, until, type TestParty } from '../testing/node-host.js';
import type { Durability } from '../model/index.js';

function value<T>(result: { ok: true; value: T } | { ok: false; error: { kind: string; message: string; cause?: unknown } }): T {
  if (!result.ok) {
    const cause = result.error.cause instanceof Error ? ` [${result.error.cause.name}: ${result.error.cause.message}]` : '';
    throw new Error(`${result.error.kind}: ${result.error.message}${cause}`);
  }
  return result.value;
}

async function pair(offline: boolean) {
  const a = await createTestParty('a', { listen: true, offline });
  const b = await createTestParty('b', { listen: true, offline });
  await a.boot();
  await b.boot();
  await until(() => a.node.getMultiaddrs().length > 0 && b.node.getMultiaddrs().length > 0, 'both reachable');
  const invitation = value(await a.model.invitations.create({ grantsInviteRight: false, visibility: 'private' }));
  const { strandId } = value(await b.model.invitations.accept(invitation.token));
  await until(async () => {
    const strands = await a.model.strands.list();
    return strands.ok && strands.value.some(s => s.id === strandId && !s.opening);
  }, "the strand open on the inviter's side");
  return { a, b, strandId };
}

const markOf = async (p: TestParty, strandId: string, content: string): Promise<Durability | undefined> => {
  const list = value(await p.model.messages.list(strandId));
  return list.find(m => m.content === content)?.delivery?.state;
};

for (const offline of [false, true]) {
  describe(`delivery, ${offline ? 'offline mode' : 'online'}`, () => {
    it('marks a sent message, and marks it delivered once the other side holds it', async () => {
      const { a, b, strandId } = await pair(offline);
      try {
        const sent = value(await a.model.messages.send(strandId, { content: 'hello' }));
        expect(sent.delivery?.state).toBeDefined();
        const first: Durability[] = offline ? ['waiting', 'sending', 'here', 'delivered'] : ['here', 'delivered'];
        expect(first).toContain(sent.delivery!.state);
        await until(async () => (await markOf(a, strandId, 'hello')) === 'delivered', 'the message delivered');
        await until(async () => value(await b.model.messages.list(strandId)).some(m => m.content === 'hello'), 'b sees it');
        // Other people's messages carry no mark.
        expect(value(await b.model.messages.list(strandId)).find(m => m.content === 'hello')?.delivery).toBeUndefined();
        // Edits and reactions are followed too.
        value(await a.model.messages.edit(strandId, sent.id, 'hello again'));
        await until(async () => (await markOf(a, strandId, 'hello again')) === 'delivered', 'the edit delivered');
        value(await a.model.messages.react(strandId, sent.id, '👍'));
        await until(async () => {
          const m = value(await a.model.messages.list(strandId)).find(x => x.id === sent.id);
          return m?.reactions.find(r => r.symbol === '👍')?.delivery?.state === 'delivered';
        }, 'the reaction delivered');
        // The outbox counts from the queue's own events, which can trail the delivery marks by a
        // moment (seen under a parallel full run): wait for it to empty rather than assert at once.
        await until(async () => value(await a.model.messages.outbox(strandId)).waiting === 0, 'the outbox empty');
        expect(value(await a.model.messages.outbox(strandId))).toMatchObject({ waiting: 0, failed: [] });
      } finally {
        await Promise.allSettled([a.stop(), b.stop()]);
      }
    }, 180_000);
  });
}

describe('delivery, offline mode with the other side gone', () => {
  it('saves a send here at once, counts it waiting, and will not leave without asking', async () => {
    const { a, b, strandId } = await pair(true);
    try {
      value(await a.model.messages.send(strandId, { content: 'before' }));
      await until(async () => (await markOf(a, strandId, 'before')) === 'delivered', 'the first message delivered');
      await b.stop();

      const t0 = Date.now();
      const sent = value(await a.model.messages.send(strandId, { content: 'while away' }));
      const took = Date.now() - t0;
      expect(['waiting', 'sending']).toContain(sent.delivery?.state);
      await until(async () => (await markOf(a, strandId, 'while away')) === 'waiting', 'the message waiting');
      const waiting = value(await a.model.messages.list(strandId)).find(m => m.content === 'while away')!;
      // An ordinary message cannot be made to fail by anyone else's write (fresh id): no "may not go through".
      expect(waiting.delivery?.mayFail ?? false).toBe(false);
      expect(waiting.delivery?.discardable).toBe(true);
      await until(async () => value(await a.model.messages.outbox(strandId)).waiting >= 1, 'counted waiting');
      console.info(`[delivery test] offline send with the other side gone returned in ${took} ms`);

      const left = await a.model.strands.leave(strandId, { keepIdentity: true });
      expect(left.ok).toBe(false);
      if (!left.ok) expect(left.error.kind).toBe('unsent-messages');
    } finally {
      await Promise.allSettled([a.stop(), b.stop()]);
    }
  }, 180_000);
});
