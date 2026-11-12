/**
 * Work the app started in the background is waited for, not reported as a failure: a new
 * conversation founded for an invitation starts in the background (sereus#49), and asking for
 * it before it is up (opening it, sending into it) waits for it rather than failing
 * `not-attached`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestParty, type TestParty } from '../testing/node-host.js';

describe('a conversation still starting in the background', () => {
  let party: TestParty;
  beforeAll(async () => {
    party = await createTestParty('opening', { listen: true });
    await party.boot();
  });
  afterAll(async () => { await party?.stop(); });

  it('can be read and written straight after its invitation is made', async () => {
    const created = await party.model.invitations.create({ grantsInviteRight: false, visibility: 'private' });
    if (!created.ok) throw new Error(created.error.message);
    const strandId = created.value.strandId!;
    // Immediately, with no wait for the background start.
    const listed = await party.model.messages.list(strandId);
    expect(listed.ok ? 'ok' : `${listed.error.kind}: ${listed.error.message}`).toBe('ok');
    const sent = await party.model.messages.send(strandId, { content: 'first, before it was up' });
    expect(sent.ok ? 'ok' : `${sent.error.kind}: ${sent.error.message}`).toBe('ok');
  });
});
