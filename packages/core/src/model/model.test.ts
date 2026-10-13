import { describe, expect, it } from 'vitest';
import { pageMessages, type Message } from './index.js';

const msg = (id: string): Message => ({
  id, memberId: 'm', content: id, timestamp: '2026-10-12T00:00:00Z', replyToId: null, editedAt: null, attachments: [], reactions: [],
});

describe('pageMessages', () => {
  const all = ['a', 'b', 'c', 'd', 'e'].map(msg);
  const ids = (list: Message[]) => list.map(m => m.id).join('');
  it('returns everything without options', () => expect(ids(pageMessages(all))).toBe('abcde'));
  it('keeps the newest `limit`', () => expect(ids(pageMessages(all, { limit: 2 }))).toBe('de'));
  it('takes only older than `before`', () => expect(ids(pageMessages(all, { before: 'd' }))).toBe('abc'));
  it('combines them: the page before', () => expect(ids(pageMessages(all, { before: 'd', limit: 2 }))).toBe('bc'));
  it('an unknown `before` gives nothing', () => expect(pageMessages(all, { before: 'z' })).toEqual([]));
});
