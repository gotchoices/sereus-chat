/* eslint-disable no-undef */
const { device, element, by, expect } = require('detox');

describe('Navigation and deep links', () => {
  it('shows connections list on launch', async () => {
    await expect(element(by.id('connections-list'))).toBeVisible();
  });

  it('deep links to empty variant', async () => {
    if (device.getPlatform() === 'android') {
      await device.launchApp({
        newInstance: true,
        url: 'chat://connections?variant=empty',
      });
    } else {
      await device.launchApp({
        newInstance: true,
        url: 'chat://connections?variant=empty',
      });
    }
    await waitFor(element(by.id('empty-state')))
      .toBeVisible()
      .withTimeout(8000);
  });
});


