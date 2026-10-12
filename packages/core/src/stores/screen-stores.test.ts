import { describe, expect, it } from 'vitest';
import { createMockModel } from '../mock/index.js';
import { diskFixtures } from '../testing/disk-fixtures.js';
import { chatStore, isSending } from './chat.js';
import { sortStrands, strandListStore } from './strand-list.js';
import type { LoadState } from './loader.js';
import type { Readable } from './store.js';

/** Resolve with the first value `ready` reports, while subscribed. */
function whenReady<T>(store: Readable<LoadState<T>>): Promise<{ value: T; stop: () => void }> {
  return new Promise(resolve => {
    let stop = () => {};
    stop = store.subscribe(s => { if (s.state === 'ready') resolve({ value: s.value, stop: () => stop() }); });
  });
}

describe('strand-list store', () => {
  it('reads strands, member names and invitations, and reports start-up settled', async () => {
    const { model } = createMockModel(diskFixtures);
    const { value, stop } = await whenReady(strandListStore(model));
    expect(value.strands.length).toBeGreaterThan(0);
    expect(Object.keys(value.memberNames)).toEqual(value.strands.map(s => s.id));
    expect(value.settling).toBe(false);
    expect(value.bootError).toBeNull();
    stop();
  });

  it('keeps a hard-muted strand in place however recent', () => {
    const base = { title: 't', isGroup: false, memberCount: 2, unreadCount: 0, mentioned: false, draftPreview: null, archived: false, pending: false };
    const at = (ts: string) => ({ previewText: '', senderName: null, timestamp: ts });
    const sorted = sortStrands([
      { ...base, id: 'old', muted: 'none', lastMessage: at('2026-01-01T00:00:00Z') },
      { ...base, id: 'loud', muted: 'hard', lastMessage: at('2026-06-01T00:00:00Z') },
      { ...base, id: 'new', muted: 'none', lastMessage: at('2026-05-01T00:00:00Z') },
    ], 'recent');
    expect(sorted.map(s => s.id)).toEqual(['new', 'old', 'loud']);
  });
});

describe('chat store', () => {
  it('shows a sent message as pending, then as stored', async () => {
    const { model } = createMockModel(diskFixtures);
    const strandId = (await model.strands.list() as { ok: true; value: Array<{ id: string }> }).value[0].id;
    const store = chatStore(model, strandId);
    const { stop } = await whenReady(store);
    const sending = store.send({ content: 'hello there' });
    const during = store.get();
    expect(during.state === 'ready' && during.value.messages.some(m => isSending(m) && m.content === 'hello there')).toBe(true);
    const result = await sending;
    expect(result.ok).toBe(true);
    const after = store.get();
    const mine = after.state === 'ready' ? after.value.messages.filter(m => m.content === 'hello there') : [];
    expect(mine).toHaveLength(1);
    expect(isSending(mine[0])).toBe(false);
    stop();
  });

  it('drops the pending row and returns the failure when the write fails', async () => {
    const { model, controls } = createMockModel(diskFixtures);
    const strandId = (await model.strands.list() as { ok: true; value: Array<{ id: string }> }).value[0].id;
    const store = chatStore(model, strandId);
    const { stop } = await whenReady(store);
    controls.setVariant('error');
    const result = await store.send({ content: 'lost' });
    expect(result.ok ? null : result.error.kind).toBe('unavailable');
    const after = store.get();
    expect(after.state === 'ready' && after.value.messages.some(m => m.content === 'lost')).toBe(false);
    stop();
  });
});
