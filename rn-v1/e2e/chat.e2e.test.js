/* eslint-disable no-undef */
const { device, element, by, expect, waitFor } = require('detox');

describe('Chat Interface basics', () => {
  it('opens happy chat with messages', async () => {
    await device.launchApp({
      newInstance: true,
      url: 'chat://chat/t-susan?variant=happy',
    });
    await waitFor(element(by.id('chat-list'))).toBeVisible().withTimeout(8000);
    await expect(element(by.id('message-m1'))).toBeVisible();
  });

  it('sends a composed text message', async () => {
    await device.launchApp({
      newInstance: true,
      url: 'chat://chat/t-susan?variant=happy',
    });
    const input = element(by.id('composer-input'));
    await waitFor(input).toBeVisible().withTimeout(8000);
    await input.replaceText('Hello test');
    await expect(element(by.id('composer-send'))).toBeVisible();
    await element(by.id('composer-send')).tap();
    // New message bubble should appear with text
    await expect(element(by.text('Hello test'))).toBeVisible();
    // Input cleared
    await expect(input).toHaveText('');
  });
});


