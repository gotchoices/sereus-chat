import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Linking } from 'react-native';
import enScreens from './locales/en/screens.json';
import esScreens from './locales/es/screens.json';

// Minimal live i18n with Context. Later swappable with i18next.
// - useT() provides a stable t() that re-renders on locale change
// - Parses ?locale= from deep links (launch + runtime)

type Translations = Record<string, unknown>;
type Namespaces = Record<string, Translations>;
type LocaleResources = Record<string, Namespaces>;

const resources: LocaleResources = {
  en: { screens: enScreens as Translations },
  es: { screens: esScreens as Translations },
};

type I18nContextValue = {
  locale: string;
  setLocale: (l: string) => void;
};

const I18nContext = createContext<I18nContextValue>({
  locale: 'en',
  setLocale: () => {},
});

function getFromObject(obj: any, path: string): unknown {
  const parts = path.split('.');
  let cur: any = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

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

export function useT() {
  const { locale } = useContext(I18nContext);
  const t = React.useCallback(
    (key: string, defaultText?: string): string => {
      const [namespace, ...rest] = key.split('.');
      const path = rest.join('.');
      const ns = resources[locale]?.[namespace];
      const value = ns ? getFromObject(ns, path) : undefined;
      if (typeof value === 'string') return value;
      return defaultText ?? key;
    },
    [locale],
  );
  return t;
}


