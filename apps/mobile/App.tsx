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
    // Step-1 smoke test: boot the cadre layer in the background.  Errors are
    // logged; the rest of the app keeps running on stubs until adapter
    // operations are wired up.
    (async () => {
      try {
        const { cadreService } = await import('./src/cadre');
        await cadreService.ensureStarted();
      } catch (err) {
        console.error('[App] CadreService boot failed:', err);
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
