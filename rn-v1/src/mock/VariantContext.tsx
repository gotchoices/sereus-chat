import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Linking } from 'react-native';
import { mockMode, type Variant } from './config';

type VariantContextValue = {
  mockMode: boolean;
  variant: Variant;
  setVariant: (v: Variant) => void;
};

const VariantContext = createContext<VariantContextValue>({
  mockMode,
  variant: 'happy',
  setVariant: () => {},
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
  const [variant, setVariant] = useState<Variant>('happy');

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

  const value = useMemo(() => ({ mockMode, variant, setVariant }), [variant]);
  return <VariantContext.Provider value={value}>{children}</VariantContext.Provider>;
}

export function useVariant() {
  return useContext(VariantContext);
}


