import { describe, expect, it } from 'vitest';
import {
  buildInviteUrl,
  CHAT_SAPP_ID,
  CHAT_SCHEMA_DDL,
  extractInnerDDL,
  getChatSAppConfig,
  parseInviteToken,
} from './index.js';

describe('invite links', () => {
  it('builds the fragment form and parses it back', () => {
    const url = buildInviteUrl('abc_DEF-123');
    expect(url).toBe('https://sereus.org/chat/invite/#abc_DEF-123');
    expect(parseInviteToken(url)).toBe('abc_DEF-123');
  });

  it('accepts every form that has been handed out', () => {
    for (const form of [
      'https://sereus.org/chat/invite/#tok',
      'https://sereus.org/chat/invite/tok',
      'https://sereus.org/chat/invite/?t=tok',
      'sereus://invite/tok',
      'chat://invite/tok',
      '  sereus://invite/tok?x=1  ',
    ]) {
      expect(parseInviteToken(form)).toBe('tok');
    }
  });

  it('refuses what is not a chat invitation', () => {
    expect(parseInviteToken('https://example.com/chat/invite/#tok')).toBeNull();
    expect(parseInviteToken('sereus://relay/tok')).toBeNull();
    expect(parseInviteToken('https://sereus.org/chat/invite/')).toBeNull();
  });
});

describe('the chat sApp', () => {
  it('carries the schema from the domain contract, unwrapped', () => {
    const config = getChatSAppConfig();
    expect(config.id).toBe(CHAT_SAPP_ID);
    expect(config.schema).toBe(CHAT_SCHEMA_DDL);
    for (const table of ['Member', 'Message', 'Reaction', 'Attachment']) {
      expect(CHAT_SCHEMA_DDL).toMatch(new RegExp(`table ${table} \\(`));
    }
    expect(CHAT_SCHEMA_DDL).not.toMatch(/^\s*--/m);
  });

  it('strips a declare-schema wrapper', () => {
    expect(extractInnerDDL('-- c\ndeclare schema App {\n  table T (Id text primary key);\n}\n'))
      .toBe('table T (Id text primary key);');
  });
});
