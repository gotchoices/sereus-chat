import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Linking } from 'react-native';
import { createTranslator, errorText, type AnyCatalog, type ErrorLike, type Translator } from '@chat/resources';
import enApp from './locales/en/app.json';
import esApp from './locales/es/app.json';

// Live i18n with Context over the shared catalogs (@chat/resources).
// - Keys are `area.key`. This app's own catalog (locales/<l>/app.json) holds what only
//   it shows — device features, its own layout — and may override any shared key.
// - useT() provides a stable t() that re-renders on locale change
// - Parses ?locale= from deep links (launch + runtime)

const appCatalogs: Record<string, AnyCatalog> = { en: enApp, es: esApp };

type I18nContextValue = {
  locale: string;
  setLocale: (l: string) => void;
};

const I18nContext = createContext<I18nContextValue>({
  locale: 'en',
  setLocale: () => {},
});

function parseLocaleFromUrl(url: string | null): string | null {
  if (!url) return null;
  const qIndex = url.indexOf('?');
  if (qIndex === -1) return null;
  const query = url.slice(qIndex + 1);
  for (const part of query.split('&')) {
    const [k, v] = part.split('=');
    if (k === 'locale' && v) return decodeURIComponent(v);
  }
  return null;
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocale] = useState<string>('en');

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const initial = await Linking.getInitialURL();
        const loc = parseLocaleFromUrl(initial);
        if (mounted && loc) setLocale(loc);
      } catch {}
    })();
    const sub = Linking.addEventListener('url', e => {
      const loc = parseLocaleFromUrl(e.url);
      if (loc) setLocale(loc);
    });
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  const value = useMemo(() => ({ locale, setLocale }), [locale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useLocale() {
  return useContext(I18nContext).locale;
}

export function useT(): Translator {
  const { locale } = useContext(I18nContext);
  return useMemo(() => createTranslator(locale, appCatalogs), [locale]);
}

/**
 * Words for a failure, in the current locale: a model error (a `ChatError`, or what
 * `orThrow` threw) through the catalog by kind and reason; anything else by its own
 * message, else `fallback`.
 */
export function useErrorText(): (error: unknown, fallback?: string) => string {
  const t = useT();
  return React.useCallback((error: unknown, fallback?: string) => {
    if (error && typeof error === 'object' && 'kind' in error && 'message' in error) {
      return errorText(t, error as ErrorLike);
    }
    const message = error instanceof Error ? error.message : undefined;
    return message || fallback || t('errors.unexpected');
  }, [t]);
}
