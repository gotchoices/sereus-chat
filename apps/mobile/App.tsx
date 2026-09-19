import React, { useEffect } from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import AppNavigator from './src/navigation/AppNavigator';
import { VariantProvider } from './src/mock/VariantContext';
import { I18nProvider } from './src/i18n';
import { ThemeProvider, useThemeContext } from './src/theme';
import { USE_SEREUS } from './src/data/config';

/** Themed shell: safe-area background + status bar follow the active theme. */
function ThemedShell() {
  const { theme, scheme } = useThemeContext();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <StatusBar
        barStyle={scheme === 'dark' ? 'light-content' : 'dark-content'}
        backgroundColor={theme.background}
      />
      <AppNavigator />
    </SafeAreaView>
  );
}

export default function App() {
  useEffect(() => {
    if (!USE_SEREUS) return;
    // Boot the cadre layer in the background and attach the default chat
    // strand so the live data path is warm by the time the user opens a
    // chat screen.  Errors are logged; the rest of the app keeps running.
    (async () => {
      try {
        const { ensureDefaultChatStrand, applySavedRelays, watchDiscoveredStrands } =
          await import('./src/data/chat-strand');
        // Relays FIRST, and specifically before anything starts the node: they are
        // named at construction, and that is the only path that gives a circuit
        // address to the strand nodes a conversation actually lives on.
        await applySavedRelays();
        // Before the default strand, because the strand watcher offers stored
        // strands about 100 ms after the node starts and never re-offers them.
        // Anything invited into existence by our own formation responder — which
        // writes the strand row but does not launch it — arrives this way, and a
        // listener attached later misses it for the life of the process.
        await watchDiscoveredStrands();
        await ensureDefaultChatStrand();
      } catch (err) {
        // Expected on a solo node: attaching the default strand reads the
        // control DB, which times out without a cohort.  It attaches once the
        // phone joins a cadre (a drone/relay).  Warn, don't error.
        console.warn('[App] default strand not attached yet:', err instanceof Error ? err.message : err);
      }
    })();
  }, []);

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <I18nProvider>
          <VariantProvider>
            <ThemedShell />
          </VariantProvider>
        </I18nProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
