/**
 * The party's private strand (`protocol/private-sapp.ts`, measurement stage): with the host
 * running it, it comes up at boot under its derived id, holds its own tables, and is never
 * listed, searched or registered in as a conversation. Restart is covered with serchat,
 * whose profile survives a process (this host's storage does not).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { privateStrandId } from '../protocol/private-sapp.js';
import { createTestParty, until, type TestParty } from '../testing/node-host.js';

describe('the private strand', () => {
  let party: TestParty;
  beforeAll(async () => {
    party = await createTestParty('priv', { listen: true, privateStrand: true });
    await party.boot();
  });
  afterAll(async () => { await party?.stop(); });

  it('comes up at boot under the id derived from the party, with its own schema', async () => {
    const id = privateStrandId(party.node.partyId);
    await until(() => party.node.getStrands().get(id)?.database !== undefined, 'the private strand running');
    const db = party.node.getStrands().get(id)!.database!.getDatabase();
    await until(async () => {
      for await (const row of db.eval('select count(*) as N from App.Label')) return Number(row.N) >= 1;
      return false;
    }, 'the measured label written');
    expect(party.node.getSAppId(id)).toBe('org.sereus.chat.private');
  });

  it('is not a conversation: not listed, and a new conversation is', async () => {
    const id = privateStrandId(party.node.partyId);
    const created = await party.model.invitations.create({ grantsInviteRight: false, visibility: 'private' });
    if (!created.ok) throw new Error(created.error.message);
    await until(async () => {
      const list = await party.model.strands.list();
      return list.ok && list.value.some(s => s.id === created.value.strandId && !s.opening);
    }, 'the new conversation listed');
    const list = await party.model.strands.list();
    expect(list.ok && list.value.map(s => s.id)).not.toContain(id);
    const usage = await party.model.media.storageUsage();
    expect(usage.ok && usage.value.byStrand.map(s => s.strandId)).not.toContain(id);
  });
});
