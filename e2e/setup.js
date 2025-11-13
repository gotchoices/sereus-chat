const { device } = require('detox');

beforeAll(async () => {
  await device.launchApp({ delete: true, newInstance: true });
});

beforeEach(async () => {
  await device.reloadReactNative();
});


