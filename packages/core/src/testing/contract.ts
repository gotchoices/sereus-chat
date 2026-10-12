/**
 * The `ChatModel` contract: one suite, run against every implementation — the mock now,
 * the Sereus model (two nodes, loopback and relay-only) from Phase 5. It checks what any
 * implementation must do, so fixtures that show something the Sereus model can never
 * produce fail it (docs/app-family.md, "Testing").
 *
 * `setup` returns a model with at least one strand on it, and tears down after.
 */
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { parseInviteToken } from '../protocol/index.js';
import type { ChatModel, Result } from '../model/index.js';
import { isSettled } from '../model/index.js';

export interface ContractTarget {
  model: ChatModel;
  teardown?: () => Promise<void>;
}

function value<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(`expected ok, got ${result.error.kind}: ${result.error.message}`);
  return result.value;
}

export function describeChatModelContract(name: string, setup: () => Promise<ContractTarget>): void {
  describe(`ChatModel contract: ${name}`, () => {
    let target: ContractTarget;
    let model: ChatModel;
    let strandId: string;

    beforeAll(async () => {
      target = await setup();
      model = target.model;
      const strands = value(await model.strands.list());
      expect(strands.length).toBeGreaterThan(0);
      strandId = strands[0].id;
    });
    afterAll(async () => { await target?.teardown?.(); });

    it('lists strands with unique ids and plausible summaries', async () => {
      const strands = value(await model.strands.list());
      expect(new Set(strands.map(s => s.id)).size).toBe(strands.length);
      for (const s of strands) {
        expect(s.memberCount).toBeGreaterThanOrEqual(1);
        expect(s.unreadCount).toBeGreaterThanOrEqual(0);
        expect(['none', 'soft', 'hard']).toContain(s.muted);
      }
    });

    it("derives a strand's settled state from recorded state only", async () => {
      const state = value(await model.strands.state(strandId));
      expect(state.settled).toBe(isSettled(state));
    });

    it('lists exactly one member who is this device', async () => {
      const members = value(await model.members.list(strandId));
      expect(members.filter(m => m.isMe)).toHaveLength(1);
    });

    it('returns a sent message, newest last, and signals the strand', async () => {
      let signalled = 0;
      const unsubscribe = model.changes.strand(strandId, () => { signalled++; });
      const content = `contract ${Date.now()}`;
      const sent = value(await model.messages.send(strandId, { content }));
      expect(sent.content).toBe(content);
      expect(sent.replyToId).toBeNull();
      const messages = value(await model.messages.list(strandId));
      expect(messages[messages.length - 1].id).toBe(sent.id);
      expect(signalled).toBeGreaterThan(0);
      unsubscribe();
    });

    it('makes an invitation whose link carries its token', async () => {
      const invitation = value(await model.invitations.create({ strandId, grantsInviteRight: false }));
      expect(parseInviteToken(invitation.url)).toBe(invitation.token);
      expect(invitation.spent).toBe(false);
    });

    it('merges prefs and keeps the profile', async () => {
      const before = value(await model.prefs.get());
      const after = value(await model.prefs.set({ notifyDefault: 'mentions' }));
      expect(after).toEqual({ ...before, notifyDefault: 'mentions' });
      const profile = { ...value(await model.profile.get()), name: 'Contract Name' };
      value(await model.profile.save(profile));
      expect(value(await model.profile.get()).name).toBe('Contract Name');
    });

    it('searches in batches that end with every strand searched', async () => {
      let last: { strandsSearched: number; strandsTotal: number } | null = null;
      for await (const batch of model.search.run('a')) {
        const b = value(batch);
        if (last) expect(b.strandsSearched).toBeGreaterThan(last.strandsSearched);
        last = b;
      }
      if (last) expect(last.strandsSearched).toBe(last.strandsTotal);
    });
  });
}
