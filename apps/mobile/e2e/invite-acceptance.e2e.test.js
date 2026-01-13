/* eslint-env detox/detox, jest */

describe('InvitationAcceptance deep link', () => {
  it('launches to InvitationAcceptance via deep link and shows token', async () => {
    await device.launchApp({
      newInstance: true,
      url: 'chat://invite/e2e-token?variant=happy',
    });
    await expect(element(by.id('invite-token'))).toBeVisible();
    await expect(element(by.id('accept-join'))).toBeVisible();
  });
});


