import React from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import AppNavigator from './src/navigation/AppNavigator';
import { VariantProvider } from './src/mock/VariantContext';

export default function App() {
  return (
    <SafeAreaProvider>
      <VariantProvider>
        <SafeAreaView style={{ flex: 1 }}>
          <StatusBar barStyle="dark-content" />
          <AppNavigator />
        </SafeAreaView>
      </VariantProvider>
    </SafeAreaProvider>
  );
}
