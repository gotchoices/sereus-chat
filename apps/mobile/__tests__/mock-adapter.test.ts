/**
 * The app's mock path: the core's mock model over this app's bundled fixture list —
 * every fixture the app bundles is there, and failures come back as model results.
 */
import { createMockModel } from '@chat/core';
import { appFixtures } from '../src/data/mock-fixtures';
import { orThrow } from '../src/data/or-throw';

describe('mock model over the bundled fixtures', () => {
  it('serves every fixture the app bundles', async () => {
    const { model } = createMockModel(appFixtures);
    const strands = orThrow(await model.strands.list());
    expect(strands.length).toBeGreaterThan(0);
    const id = strands[0].id;
    expect(orThrow(await model.messages.list(id))).toBeInstanceOf(Array);
    expect(orThrow(await model.members.list(id))).toBeInstanceOf(Array);
    expect(orThrow(await model.media.list(id))).toBeInstanceOf(Array);
    expect(orThrow(await model.strands.state(id))).toHaveProperty('settled');
    expect(orThrow(await model.invitations.listOutstanding())).toBeInstanceOf(Array);
    expect(orThrow(await model.media.storageUsage())).toHaveProperty('totalBytes');
    expect(orThrow(await model.profile.get())).toHaveProperty('name');
    expect(orThrow(await model.prefs.get())).toHaveProperty('theme');
  });

  it('turns a failed result into an Error with its kind', async () => {
    const { model, controls } = createMockModel(appFixtures);
    controls.setVariant('error');
    const result = await model.strands.list();
    expect(() => orThrow(result)).toThrow();
    try { orThrow(result); } catch (e) { expect(e).toMatchObject({ kind: 'unavailable', retryable: true }); }
  });

  it('reports the unreachable kind for an invitation with nowhere to answer', async () => {
    const { model, controls } = createMockModel(appFixtures);
    controls.setVariant('unreachable');
    const created = await model.invitations.create({ grantsInviteRight: false });
    expect(created.ok ? null : created.error.kind).toBe('unreachable');
  });
});
