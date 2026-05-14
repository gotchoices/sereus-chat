import React, { useEffect } from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import AppNavigator from './src/navigation/AppNavigator';
import { VariantProvider } from './src/mock/VariantContext';
import { I18nProvider } from './src/i18n';
import { USE_SEREUS } from './src/data/config';

export default function App() {
  useEffect(() => {
    if (!USE_SEREUS) return;
    // Boot the cadre layer in the background and attach the default chat
    // strand so the live data path is warm by the time the user opens a
    // chat screen.  Errors are logged; the rest of the app keeps running.
    (async () => {
      try {
        const { ensureDefaultChatStrand } = await import('./src/data/chat-strand');
        await ensureDefaultChatStrand();
      } catch (err) {
        console.error('[App] cadre boot failed:', err);
      }
    })();
  }, []);

  return (
    <SafeAreaProvider>
      <I18nProvider>
        <VariantProvider>
          <SafeAreaView style={{ flex: 1 }}>
            <StatusBar barStyle="dark-content" />
            <AppNavigator />
          </SafeAreaView>
        </VariantProvider>
      </I18nProvider>
    </SafeAreaProvider>
  );
}
