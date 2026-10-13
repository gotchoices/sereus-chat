import { describe, expect, it } from 'vitest';
import { CHAT_ERROR_KINDS } from '@chat/core';
import { createTranslator, errorText, format, strings, type AnyCatalog } from './index.js';

function keys(catalog: AnyCatalog, prefix = ''): string[] {
  return Object.entries(catalog).flatMap(([k, v]) => (typeof v === 'string' ? [prefix + k] : keys(v, `${prefix}${k}.`)));
}

describe('string catalogs', () => {
  it('has words for every error kind the core returns', () => {
    const missing = CHAT_ERROR_KINDS.filter(kind => {
      const entry = (strings.en.errors as AnyCatalog)[kind];
      return typeof entry !== 'string' && typeof (entry as AnyCatalog | undefined)?.default !== 'string';
    });
    expect(missing).toEqual([]);
  });

  it('other locales only translate keys English has', () => {
    const english = new Set(keys(strings.en as AnyCatalog));
    for (const [locale, catalog] of Object.entries(strings)) {
      expect(keys(catalog as AnyCatalog).filter(k => !english.has(k)), locale).toEqual([]);
    }
  });

  it('looks in the app catalog first, then shared, then English', () => {
    const t = createTranslator('es', { es: { chat: { placeholder: 'Mensaje (app)' } }, en: { only: { app: 'app only' } } });
    expect(t('chat.placeholder')).toBe('Mensaje (app)');
    expect(t('chat.sending')).toBe('Enviando…');
    expect(t('chat.editing')).toBe(strings.en.chat.editing);
    expect(t('only.app')).toBe('app only');
    expect(t('no.such', 'fallback {{n}}', { n: 2 })).toBe('fallback 2');
  });

  it('words an error by reason, then kind, then the core message', () => {
    const t = createTranslator('en');
    expect(errorText(t, { kind: 'node-unreachable', reason: 'home-network', message: 'x' })).toBe(strings.en.errors['node-unreachable']['home-network']);
    expect(errorText(t, { kind: 'node-unreachable', reason: 'other', message: 'x' })).toBe(strings.en.errors['node-unreachable'].default);
    expect(errorText(t, { kind: 'invitation-spent', message: 'x' })).toBe(strings.en.errors['invitation-spent']);
    expect(errorText(t, { kind: 'brand-new-kind', message: 'core words' })).toBe('core words');
    expect(errorText(t, { kind: 'unexpected', message: 'boom' })).toContain('(boom)');
  });

  it('formats placeholders', () => {
    expect(format('{{a}} of {{b}}', { a: 1, b: 2 })).toBe('1 of 2');
    expect(format('{{a}}', {})).toBe('{{a}}');
  });
});
