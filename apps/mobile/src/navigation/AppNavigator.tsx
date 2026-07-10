import React from 'react';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import type { LinkingOptions } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View, Text } from 'react-native';
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
import { Avatar, IconButton } from '../components';
import { useTheme, useThemeContext, typography } from '../theme';

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  const theme = useTheme();
  const { scheme } = useThemeContext();

  // Bridge our tokens into React Navigation's container theme (drives header
  // background/tint, card background, and the back chevron).
  const navTheme = {
    ...(scheme === 'dark' ? DarkTheme : DefaultTheme),
    colors: {
      ...(scheme === 'dark' ? DarkTheme : DefaultTheme).colors,
      background: theme.background,
      card: theme.surface,
      text: theme.textPrimary,
      border: theme.border,
      primary: theme.accent,
      notification: theme.danger,
    },
  };

  const screenOptions = {
    headerStyle: { backgroundColor: theme.surface },
    headerTintColor: theme.textPrimary,
    headerTitleStyle: { ...typography.title, color: theme.textPrimary },
    headerShadowVisible: false,
    contentStyle: { backgroundColor: theme.background },
  } as const;

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
    <NavigationContainer linking={linking} theme={navTheme}>
      <Stack.Navigator screenOptions={screenOptions}>
        <Stack.Screen name="ConnectionsList" component={ConnectionsList} options={{ title: 'Sereus Chat' }} />
        <Stack.Screen name="SearchInterface" component={SearchInterface} options={{ title: 'Search' }} />
        <Stack.Screen name="InvitationGenerator" component={InvitationGenerator} options={{ title: 'Invite' }} />
        <Stack.Screen name="InvitationAcceptance" component={InvitationAcceptance} options={{ title: 'Accept Invite' }} />
        <Stack.Screen name="ProfileSetup" component={ProfileSetup} options={{ title: 'Profile' }} />
        <Stack.Screen name="CadreManager" component={ThemedCadreManager} options={{ title: 'My Devices' }} />
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
            return {
              headerTitle: () => (
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ marginRight: 8 }}>
                    <Avatar name={name} uri={params.avatarUrl} size="sm" />
                  </View>
                  <Text numberOfLines={1} style={{ maxWidth: 200, ...typography.title, color: theme.textPrimary }}>
                    {name}
                  </Text>
                </View>
              ),
              headerRight: () => (
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <IconButton name="call-outline" size={20} accessibilityLabel="Voice call" onPress={() => showToast('Voice call not implemented')} />
                  <IconButton name="videocam-outline" size={20} accessibilityLabel="Video call" onPress={() => showToast('Video call not implemented')} />
                  <IconButton name="search-outline" size={20} accessibilityLabel="Search in strand" onPress={() => {}} />
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

/** CadreManager is a self-themed component; feed it our active tokens so it
 *  matches the rest of the app instead of its built-in defaults. */
function ThemedCadreManager() {
  const theme = useTheme();
  return (
    <CadreManager
      theme={{
        background: theme.background,
        surface: theme.surfaceAlt,
        border: theme.border,
        textPrimary: theme.textPrimary,
        textSecondary: theme.textSecondary,
        textMuted: theme.textMuted,
        accent: theme.accent,
        accentText: theme.accentText,
        danger: theme.danger,
        online: theme.success,
        sectionLabel: theme.textSecondary,
        backdrop: theme.overlay,
      }}
    />
  );
}
