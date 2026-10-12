/**
 * The app reaches `@chat/core` through its `link:` dependency, as Metro does — the
 * linked, built package (docs/app-family.md, "How apps consume the packages").
 */
import { buildInviteUrl, CHAT_SAPP_ID, getChatSAppConfig, parseInviteToken } from '@chat/core';

describe('@chat/core from the app', () => {
  it('loads the protocol', () => {
    expect(CHAT_SAPP_ID).toBe('org.sereus.chat');
    expect(parseInviteToken(buildInviteUrl('t1'))).toBe('t1');
    expect(getChatSAppConfig().schema).toMatch(/table Message \(/);
  });
});
