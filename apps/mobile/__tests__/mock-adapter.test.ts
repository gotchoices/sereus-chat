/**
 * The app's mock path: the core's mock model, over this app's bundled fixture list,
 * behind the throwing adapter screens still call (docs/STATUS.md, Phase 4).
 */
import { createMockModel } from '@chat/core';
import { appFixtures } from '../src/data/mock-fixtures';
import { adapterFromModel } from '../src/data/legacy-adapter';
import { UnreachableError } from '../src/data/errors';

function mock() {
  const { model, controls } = createMockModel(appFixtures);
  return { adapter: adapterFromModel(model), controls };
}

describe('mock adapter over the core model', () => {
  it('serves every fixture the app bundles', async () => {
    const { adapter } = mock();
    const strands = await adapter.listStrands();
    expect(strands.length).toBeGreaterThan(0);
    const id = strands[0].id;
    await expect(adapter.listMessages(id)).resolves.toBeInstanceOf(Array);
    await expect(adapter.listMembers(id)).resolves.toBeInstanceOf(Array);
    await expect(adapter.listAttachments(id)).resolves.toBeInstanceOf(Array);
    await expect(adapter.getStrandState(id)).resolves.toHaveProperty('settled');
    await expect(adapter.listOutstandingInvitations()).resolves.toBeInstanceOf(Array);
    await expect(adapter.storageUsage()).resolves.toHaveProperty('totalBytes');
    await expect(adapter.getProfile()).resolves.toHaveProperty('name');
    await expect(adapter.getPrefs()).resolves.toHaveProperty('theme');
  });

  it('throws the model error with its kind', async () => {
    const { adapter, controls } = mock();
    controls.setVariant('error');
    await expect(adapter.listStrands()).rejects.toMatchObject({ kind: 'unavailable', retryable: true });
  });

  it('throws UnreachableError for the unreachable kind', async () => {
    const { adapter, controls } = mock();
    controls.setVariant('unreachable');
    await expect(adapter.createInvitation({ grantsInviteRight: false })).rejects.toBeInstanceOf(UnreachableError);
  });
});
