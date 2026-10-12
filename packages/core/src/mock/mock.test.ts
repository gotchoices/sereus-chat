import { describe, expect, it } from 'vitest';
import { createMockModel } from './index.js';
import { diskFixtures } from '../testing/disk-fixtures.js';
import { describeChatModelContract } from '../testing/contract.js';

describeChatModelContract('mock', async () => ({ model: createMockModel(diskFixtures).model }));

describe('mock variants', () => {
  it('fails reads with `unavailable` in the error variant', async () => {
    const { model, controls } = createMockModel(diskFixtures);
    controls.setVariant('error');
    const strands = await model.strands.list();
    expect(strands.ok).toBe(false);
    if (!strands.ok) {
      expect(strands.error.kind).toBe('unavailable');
      expect(strands.error.retryable).toBe(true);
    }
  });

  it('fails creating an invitation with `unreachable` in the unreachable variant', async () => {
    const { model, controls } = createMockModel(diskFixtures);
    controls.setVariant('unreachable');
    const created = await model.invitations.create({ grantsInviteRight: false });
    expect(created.ok ? null : created.error.kind).toBe('unreachable');
    expect(await model.reachability.get()).toMatchObject({ reachable: false, relayPending: false });
  });

  it('serves empty lists in the empty variant, and signals a variant change', async () => {
    const { model, controls } = createMockModel(diskFixtures);
    let signalled = 0;
    model.changes.strands(() => { signalled++; });
    controls.setVariant('empty');
    expect(signalled).toBe(1);
    const strands = await model.strands.list();
    expect(strands.ok && strands.value).toEqual([]);
  });
});
