import React, { useEffect, useState } from 'react';
import { StatusBar, ScrollView, Text, StyleSheet, ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
// Keyboard avoidance that works on every Android version, edge-to-edge included
// (global/ui.md, "The on-screen keyboard"). Same library as health/apps/mobile.
import { KeyboardProvider } from 'react-native-keyboard-controller';
import AppNavigator from './src/navigation/AppNavigator';
import { VariantProvider } from './src/mock/VariantContext';
import { I18nProvider } from './src/i18n';
import { ThemeProvider, useThemeContext } from './src/theme';
import { USE_SEREUS } from './src/data/config';
import { checkDataFormat, type DataFormatCheck } from './src/data/data-format';
import { startLoopLagMonitor } from './src/diagnostics/loop-lag';
import { useT } from './src/i18n';
import { typography, spacing } from './src/theme';

startLoopLagMonitor();

/**
 * Shown instead of the app when the saved data was written in a form this build
 * cannot use (src/data/data-format.ts). Nothing has started: the network node is
 * not built over data it would misread, and no screen pretends all is well.
 */
function IncompatibleData({ found, expected }: { found: string; expected: string }) {
  const { theme } = useThemeContext();
  const t = useT();
  return (
    <ScrollView contentContainerStyle={styles.incompatible}>
      <Text style={[typography.title, { color: theme.textPrimary }]}>
        {t('app.incompatibleTitle', 'This phone holds data from an older version of the app')}
      </Text>
      <Text style={[typography.body, styles.para, { color: theme.textMuted }]}>
        {t('app.incompatibleBody',
          'It was saved by {{found}}, and this version ({{expected}}) cannot use it: the network software underneath changed in a way that cannot be carried over. Your conversations on this phone cannot be reached with it.')
          .replace('{{found}}', found).replace('{{expected}}', expected)}
      </Text>
      <Text style={[typography.body, styles.para, { color: theme.textPrimary }]}>
        {t('app.incompatibleFix',
          'To start fresh, clear the app\'s storage — on Android: Settings › Apps › Sereus Chat › Storage › Clear storage; on iPhone: delete the app and install it again. Then open it and set it up as new.')}
      </Text>
    </ScrollView>
  );
}

/** Themed shell: safe-area background + status bar follow the active theme. */
function ThemedShell({ format }: { format: DataFormatCheck | null }) {
  const { theme, scheme } = useThemeContext();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <StatusBar
        barStyle={scheme === 'dark' ? 'light-content' : 'dark-content'}
        backgroundColor={theme.background}
      />
      {format === null ? (
        <View style={styles.checking}><ActivityIndicator color={theme.textMuted} /></View>
      ) : format.ok ? (
        <AppNavigator />
      ) : (
        <IncompatibleData found={format.found} expected={format.expected} />
      )}
    </SafeAreaView>
  );
}

export default function App() {
  /**
   * The saved-data check runs FIRST and gates everything: the navigator is not
   * rendered (so no screen calls the adapter, which would start the node) and the
   * background boot below does not run until the data is known to be usable.
   */
  const [format, setFormat] = useState<DataFormatCheck | null>(USE_SEREUS ? null : { ok: true });
  useEffect(() => {
    if (!USE_SEREUS) return;
    checkDataFormat()
      .then(setFormat)
      // A failed READ is not evidence of old data; carry on rather than lock out.
      .catch(err => { console.warn('[App] data format check failed:', err); setFormat({ ok: true }); });
  }, []);

  useEffect(() => {
    if (!USE_SEREUS || !format?.ok) return;
    // Boot the cadre layer in the background so the live data path is warm by
    // the time the user opens a chat screen. Nothing is CREATED here: a new user
    // has no strands until they agree one with somebody (stories 01 and 02).
    // Errors are logged; the rest of the app keeps running.
    (async () => {
      try {
        const { attachJoinedStrands, ensureCadreUp, applySavedRelays, watchDiscoveredStrands } =
          await import('./src/data/chat-strand');
        // Relays FIRST, and specifically before anything starts the node: they are
        // named at construction, and that is the only path that gives a circuit
        // address to the strand nodes a conversation actually lives on.
        await applySavedRelays();
        // Before anything else touches the node, because the strand watcher offers
        // stored strands about 100 ms after it starts and never re-offers them.
        // Anything invited into existence by our own formation responder — which
        // writes the strand row but does not launch it — arrives this way, and a
        // listener attached later misses it for the life of the process.
        await watchDiscoveredStrands();
        await ensureCadreUp();
        // Strands joined through someone else's invitation. Last, because it is
        // the only step that dials other PARTIES — the two above are local — and a
        // host that is currently unreachable should not delay our own strands.
        await attachJoinedStrands();
      } catch (err) {
        // Expected on a solo node: attaching the default strand reads the
        // control DB, which times out without a cohort.  It attaches once the
        // phone joins a cadre (a drone/relay).  Warn, don't error.
        console.warn('[App] default strand not attached yet:', err instanceof Error ? err.message : err);
      }
    })();
  }, [format]);

  return (
    <SafeAreaProvider>
      <KeyboardProvider>
        <ThemeProvider>
          <I18nProvider>
            <VariantProvider>
              <ThemedShell format={format} />
            </VariantProvider>
          </I18nProvider>
        </ThemeProvider>
      </KeyboardProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  checking: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  incompatible: { padding: spacing[4], gap: spacing[3] },
  para: { lineHeight: 22 },
});
