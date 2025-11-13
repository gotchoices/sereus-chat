import React from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import AppNavigator from './src/navigation/AppNavigator';

export default function App() {
  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1 }}>
        <StatusBar barStyle="dark-content" />
        <AppNavigator />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
