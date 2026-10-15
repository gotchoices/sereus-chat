/**
 * The ChatModel contract on the Sereus model: two parties (cadre-core nodes in this
 * process). Party A founds a strand and invites; party B joins; the contract then runs
 * on A. Two topologies:
 *   loopback    both listen on 127.0.0.1 — the fast default;
 *   relay-only  neither listens; both reserve on an in-process relay and meet only
 *               through it, as phones do (the topology behind past convergence failures).
 */
import { describe, expect, it, afterAll, beforeAll } from 'vitest';
import { describeChatModelContract } from '../testing/contract.js';
import { createTestParty, startRelay, until, type TestParty } from '../testing/node-host.js';

function value<T>(result: { ok: true; value: T } | { ok: false; error: { kind: string; message: string } }): T {
  if (!result.ok) throw new Error(`${result.error.kind}: ${result.error.message}`);
  return result.value;
}

async function pair(topology: 'loopback' | 'relay-only') {
  const relay = topology === 'relay-only' ? await startRelay() : null;
  const opts = relay ? { relayAddr: relay.addr } : { listen: true };
  const a = await createTestParty('a', opts);
  const b = await createTestParty('b', opts);
  await a.boot();
  await b.boot();
  await until(() => (a.node.getMultiaddrs().length > 0 && b.node.getMultiaddrs().length > 0), 'both parties reachable');
  if (relay) {
    // Relay-only means it: neither party has any address but a circuit through the relay.
    for (const p of [a, b]) {
      const addrs = p.node.getMultiaddrs().map(m => m.toString());
      expect(addrs.every(x => x.includes('/p2p-circuit'))).toBe(true);
    }
  }
  const invitation = value(await a.model.invitations.create({ grantsInviteRight: false, visibility: 'private' }));
  const { strandId } = value(await b.model.invitations.accept(invitation.token));
  await until(async () => {
    const strands = await a.model.strands.list();
    return strands.ok && strands.value.some(s => s.id === strandId && !s.opening);
  }, "the strand open on the inviter's side");
  return {
    a, b, strandId,
    teardown: async () => {
      await Promise.allSettled([a.stop(), b.stop()]);
      await relay?.stop();
    },
  };
}

for (const topology of ['loopback', 'relay-only'] as const) {
  describeChatModelContract(`sereus, ${topology}`, async () => {
    const { a, teardown } = await pair(topology);
    return { model: a.model, teardown };
  });

  describe(`sereus, ${topology}: both sides`, () => {
    let parties: Awaited<ReturnType<typeof pair>>;
    beforeAll(async () => { parties = await pair(topology); });
    afterAll(async () => { await parties?.teardown(); });

    it('delivers a message each way, and each side sees both members', async () => {
      const { a, b, strandId } = parties;
      const seen = (p: TestParty, text: string) => async () => {
        const list = await p.model.messages.list(strandId);
        return list.ok && list.value.some(m => m.content === text);
      };
      value(await a.model.messages.send(strandId, { content: 'from a' }));
      await until(seen(b, 'from a'), 'b to see a\'s message');
      value(await b.model.messages.send(strandId, { content: 'from b' }));
      await until(seen(a, 'from b'), 'a to see b\'s message');
      for (const p of [a, b]) {
        await until(async () => {
          const members = await p.model.members.list(strandId);
          return members.ok && members.value.length === 2;
        }, `${p.tag} to list both members`);
        const members = value(await p.model.members.list(strandId));
        expect(members.filter(m => m.isMe)).toHaveLength(1);
      }
    });
  });
}

// An invitation link that launches the app: the invitation is read and accepted while the
// node is still starting, which must wait for it, not fail as "could not get through".
describe('sereus: a link opens a cold app', () => {
  it('inspects and accepts before the node has started', async () => {
    const a = await createTestParty('a', { listen: true });
    const c = await createTestParty('c', { listen: true });
    try {
      await a.boot();
      const invitation = value(await a.model.invitations.create({ grantsInviteRight: false, visibility: 'private' }));
      expect(c.node.isRunning).toBe(false);
      expect(value(await c.model.invitations.inspect(invitation.token)).status).toBe('live');
      expect(value(await c.model.invitations.accept(invitation.token)).strandId).toBeTruthy();
    } finally {
      await Promise.allSettled([a.stop(), c.stop()]);
    }
  }, 120_000);
});

// The invitation screen founds ahead (`invitations.prepare`) while the person chooses terms.
describe('sereus: a conversation prepared ahead of its invitation', () => {
  it('is founded in the background, hidden until invited into, then used by the next invitation', async () => {
    const a = await createTestParty('a', { listen: true });
    try {
      await a.boot();
      await until(() => a.node.getMultiaddrs().length > 0, 'reachable');
      a.model.invitations.prepare('private');
      await until(() => a.node.getStrands().size === 1, 'the prepared strand open');
      const [preparedId] = [...a.node.getStrands().keys()];
      await until(async () => {
        const listed = value(await a.model.strands.list());
        return !listed.some(s => s.id === preparedId);
      }, 'the prepared strand not listed');

      const invitation = value(await a.model.invitations.create({ grantsInviteRight: false, visibility: 'private' }));
      expect(invitation.strandId).toBe(preparedId);
      expect(value(await a.model.strands.list()).some(s => s.id === preparedId)).toBe(true);

      // Taken: the next invitation without one prepared founds as it always has.
      const next = value(await a.model.invitations.create({ grantsInviteRight: false, visibility: 'private' }));
      expect(next.strandId).not.toBe(preparedId);
    } finally {
      await a.stop();
    }
  }, 120_000);
});
