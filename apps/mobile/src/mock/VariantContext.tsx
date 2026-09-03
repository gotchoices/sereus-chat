import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Linking } from 'react-native';
import { setMockVariant } from '../data/adapters/mock';

export type Variant = 'happy' | 'empty' | 'error' | string;

type VariantContextValue = {
  variant: Variant;
  setVariant: (v: Variant) => void;
  /** Bumps whenever the underlying data source changes beneath the UI.
   *  Screens list it as a dependency so they re-read; they never inspect it,
   *  and in production builds it never changes. */
  revision: number;
};

const VariantContext = createContext<VariantContextValue>({
  variant: 'happy',
  setVariant: () => {},
  revision: 0,
});

function parseVariantFromUrl(url: string | null): Variant | null {
  if (!url) return null;
  const qIndex = url.indexOf('?');
  if (qIndex === -1) return null;
  const query = url.slice(qIndex + 1);
  for (const part of query.split('&')) {
    const [k, v] = part.split('=');
    if (k === 'variant' && v) return decodeURIComponent(v);
  }
  return null;
}

export function VariantProvider({ children }: { children: React.ReactNode }) {
  const [variant, setVariantState] = useState<Variant>('happy');
  const [revision, setRevision] = useState(0);

  // Sync variant to mock adapter whenever it changes, and signal screens to
  // re-read.  Deliberately NOT a remount: remounting the navigator would reset
  // navigation, so a deep link that also changes the variant would never reach
  // its screen.
  const setVariant = (v: Variant) => {
    setVariantState(v);
    setMockVariant(v);
    setRevision(r => r + 1);
  };

  useEffect(() => {
    // Set initial variant in adapter
    setMockVariant(variant);
  }, []);

  useEffect(() => {
    let isMounted = true;
    const init = async () => {
      try {
        const initial = await Linking.getInitialURL();
        const v = parseVariantFromUrl(initial);
        if (isMounted && v) setVariant(v);
      } catch {}
    };
    init();
    const sub = Linking.addEventListener('url', e => {
      const v = parseVariantFromUrl(e.url);
      if (v) setVariant(v);
    });
    return () => {
      isMounted = false;
      sub.remove();
    };
  }, []);

  const value = useMemo(() => ({ variant, setVariant, revision }), [variant, revision]);
  return <VariantContext.Provider value={value}>{children}</VariantContext.Provider>;
}

export function useVariant() {
  return useContext(VariantContext);
}

/** Re-read signal for screens. Neutral by design — no variant awareness. */
export function useDataRevision(): number {
  return useContext(VariantContext).revision;
}
