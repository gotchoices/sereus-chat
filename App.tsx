import React from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import AppNavigator from './src/navigation/AppNavigator';
import { VariantProvider } from './src/mock/VariantContext';
import { I18nProvider } from './src/i18n';

export default function App() {
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
