import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import type { LinkingOptions } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View, Text } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import ConnectionsList from '../screens/ConnectionsList';
import SearchInterface from '../screens/SearchInterface';
import InvitationGenerator from '../screens/InvitationGenerator';
import InvitationAcceptance from '../screens/InvitationAcceptance';
import { showToast } from '../ui/toast';
import ProfileSetup from '../screens/ProfileSetup';
import QrScanner from '../screens/QrScanner';
import Alerts from '../screens/Alerts';
import ChatInterface from '../screens/ChatInterface';
import MediaPicker from '../screens/MediaPicker';
import { CadreManager } from '../cadre-ui';

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  const linking: LinkingOptions<any> = {
    prefixes: ['chat://', 'https://chat.sereus.org'],
    config: {
      screens: {
        ConnectionsList: 'connections',
        ChatInterface: 'chat/:strandId',
        SearchInterface: 'search',
        InvitationGenerator: 'invite',
        InvitationAcceptance: 'invite/:token',
        ProfileSetup: 'profile',
        CadreManager: 'cadre',
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
        <Stack.Screen name="InvitationAcceptance" component={InvitationAcceptance} options={{ title: 'Accept Invite' }} />
        <Stack.Screen name="ProfileSetup" component={ProfileSetup} options={{ title: 'Profile' }} />
        <Stack.Screen name="CadreManager" component={CadreManager} options={{ title: 'My Devices' }} />
        <Stack.Screen name="QrScanner" component={QrScanner} options={{ title: 'Scan' }} />
        <Stack.Screen name="Alerts" component={Alerts} options={{ title: 'Alerts' }} />
        <Stack.Screen
          name="MediaPicker"
          component={MediaPicker}
          options={{ headerShown: false, presentation: 'transparentModal' as any }}
        />
        <Stack.Screen
          name="ChatInterface"
          component={ChatInterface}
          options={({ route }) => {
            const params: any = route?.params ?? {};
            const name: string = params.name || 'Chat';
            const initial = (name?.[0] || '?').toUpperCase();
            return {
              headerTitle: () => (
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View
                    style={{
                      width: 28, height: 28, borderRadius: 14,
                      backgroundColor: '#f0f0f0', alignItems: 'center', justifyContent: 'center', marginRight: 8,
                    }}
                    accessibilityLabel="Chat partner avatar"
                  >
                    <Text>{initial}</Text>
                  </View>
                  <Text numberOfLines={1} style={{ maxWidth: 200 }}>{name}</Text>
                </View>
              ),
              headerRight: () => (
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Ionicons
                    name="call-outline"
                    size={20}
                    style={{ marginHorizontal: 8 }}
                    accessibilityLabel="Voice call"
                    onPress={() => showToast('Voice call not implemented')}
                  />
                  <Ionicons
                    name="videocam-outline"
                    size={20}
                    style={{ marginHorizontal: 8 }}
                    accessibilityLabel="Video call"
                    onPress={() => showToast('Video call not implemented')}
                  />
                  <Ionicons
                    name="search-outline"
                    size={20}
                    style={{ marginLeft: 8 }}
                    accessibilityLabel="Search in strand"
                    onPress={() => {}}
                  />
                </View>
              ),
              headerBackTitleVisible: false,
            };
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}


