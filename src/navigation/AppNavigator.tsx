import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import type { LinkingOptions } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import ConnectionsList from '../screens/ConnectionsList';
import SearchInterface from '../screens/SearchInterface';
import InvitationGenerator from '../screens/InvitationGenerator';
import ProfileSetup from '../screens/ProfileSetup';
import QrScanner from '../screens/QrScanner';
import Alerts from '../screens/Alerts';
import ChatInterface from '../screens/ChatInterface';

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  const linking: LinkingOptions<any> = {
    prefixes: ['chat://', 'https://chat.sereus.org'],
    config: {
      screens: {
        ConnectionsList: 'connections',
        ChatInterface: 'chat/:threadId',
        SearchInterface: 'search',
        InvitationGenerator: 'invite',
        ProfileSetup: 'profile',
        QrScanner: 'scan',
        Alerts: 'alerts',
      },
    },
  };
  return (
    <NavigationContainer linking={linking}>
      <Stack.Navigator>
        <Stack.Screen name="ConnectionsList" component={ConnectionsList} options={{ title: 'Sereus Chat' }} />
        <Stack.Screen name="SearchInterface" component={SearchInterface} options={{ title: 'Search' }} />
        <Stack.Screen name="InvitationGenerator" component={InvitationGenerator} options={{ title: 'Invite' }} />
        <Stack.Screen name="ProfileSetup" component={ProfileSetup} options={{ title: 'Profile' }} />
        <Stack.Screen name="QrScanner" component={QrScanner} options={{ title: 'Scan' }} />
        <Stack.Screen name="Alerts" component={Alerts} options={{ title: 'Alerts' }} />
        <Stack.Screen name="ChatInterface" component={ChatInterface} options={{ title: 'Chat' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}


