/**
 * A conversation (RN: ChatInterface): the core's `chatStore` (messages newest last, a
 * pending send shown at once), and a composer.
 */
import { Observable, type EventData, type Page } from '@nativescript/core';
import { chatStore, isSending } from '@chat/core';
import { errorText } from '@chat/resources';
import { model, t } from '../src/model';

class ChatModel extends Observable {
  title: string;
  notice = '';
  draft = '';
  placeholder = t('chat.placeholder');
  messages: Array<{ from: string; text: string }> = [];
  private readonly store;
  private stop: (() => void) | null = null;

  constructor(private readonly strandId: string, title: string) {
    super();
    this.title = title || 'Conversation';
    this.store = chatStore(model, strandId);
  }

  start() {
    this.stop ??= this.store.subscribe(load => {
      const view = load.value;
      if (!view) { this.set('notice', load.state === 'failed' ? errorText(t, load.error) : t('chat.connecting')); return; }
      const names = new Map(view.members.map(m => [m.id, m.isMe ? 'me' : m.name]));
      const others = view.members.filter(m => !m.isMe);
      if (others.length) this.set('title', others.map(m => m.name).join(', '));
      this.set('notice', view.opening ? t('chat.connecting') : '');
      this.set('messages', view.messages.map(m => ({
        from: (names.get(m.memberId) ?? m.memberId.slice(0, 8)) + (isSending(m) ? ` · ${t('chat.sending')}` : ''),
        text: m.content,
      })));
    });
  }

  end() { this.stop?.(); this.stop = null; }

  send = async () => {
    const content = (this.draft ?? '').trim();
    if (!content) return;
    this.set('draft', '');
    const r = await this.store.send({ content });
    if (!r.ok) this.set('notice', errorText(t, r.error));
  };
}

export function onNavigatingTo(args: EventData) {
  const page = args.object as Page;
  const ctx = (page.navigationContext ?? {}) as { strandId: string; title?: string };
  if (!(page.bindingContext instanceof ChatModel)) page.bindingContext = new ChatModel(ctx.strandId, ctx.title ?? '');
  (page.bindingContext as ChatModel).start();
}

export function onNavigatedFrom(args: EventData) {
  ((args.object as Page).bindingContext as ChatModel | undefined)?.end?.();
}
