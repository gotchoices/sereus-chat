import React from 'react';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import type { LinkingOptions } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View, Text, Pressable } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import StrandList from '../screens/StrandList';
import SearchInterface from '../screens/SearchInterface';
import InvitationGenerator from '../screens/InvitationGenerator';
import InvitationAcceptance from '../screens/InvitationAcceptance';
import { showToast } from '../ui/toast';
import Profile from '../screens/Profile';
import Settings from '../screens/Settings';
import StrandDetail from '../screens/StrandDetail';
import StrandMedia from '../screens/StrandMedia';
import MediaViewer from '../screens/MediaViewer';
import QrScanner from '../screens/QrScanner';
import ChatInterface from '../screens/ChatInterface';
import MediaPicker from '../screens/MediaPicker';
import { CadreManager } from '../cadre-ui';
import { Avatar, IconButton } from '../components';
import { useTheme, useThemeContext, typography } from '../theme';
import { USE_SEREUS } from '../data/config';

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
    prefixes: ['sereus://', 'chat://', 'https://sereus.org/chat'],
    config: {
      screens: {
        StrandList: 'strands',
        ChatInterface: 'strand/:strandId',
        StrandDetail: 'strand/:strandId/about',
        StrandMedia: 'strand/:strandId/shared',
        SearchInterface: 'search',
        InvitationGenerator: 'invite',
        InvitationAcceptance: 'invite/:token',
        Profile: 'profile',
        Settings: 'settings',
        CadreManager: 'machines',
        QrScanner: 'scan',
      },
    },
  };

  return (
    <NavigationContainer linking={linking} theme={navTheme}>
      <Stack.Navigator screenOptions={screenOptions}>
        <Stack.Screen name="StrandList" component={StrandList} options={{ title: 'Strands' }} />
        <Stack.Screen name="SearchInterface" component={SearchInterface} options={{ title: 'Search' }} />
        <Stack.Screen
          name="InvitationGenerator"
          component={InvitationGenerator}
          options={({ route }: any) => ({
            // Two jobs, one screen — the title says which (navigation.md).
            title: route?.params?.strandId ? 'Add someone' : 'New strand',
          })}
        />
        {/* Not "Accept invite" — the decision has not been made, and the title
            should not presume it. */}
        <Stack.Screen name="InvitationAcceptance" component={InvitationAcceptance} options={{ title: 'Invitation' }} />
        <Stack.Screen name="Profile" component={Profile} options={{ title: 'Profile' }} />
        <Stack.Screen name="Settings" component={Settings} options={{ title: 'Settings' }} />
        <Stack.Screen
          name="StrandDetail"
          component={StrandDetail}
          options={({ route }: any) => ({ title: route?.params?.title ?? 'About' })}
        />
        <Stack.Screen name="StrandMedia" component={StrandMedia} options={{ title: 'Shared here' }} />
        <Stack.Screen
          name="MediaViewer"
          component={MediaViewer}
          options={{ headerShown: false, presentation: 'fullScreenModal' as any }}
        />
        <Stack.Screen name="CadreManager" component={ThemedCadreManager} options={{ title: 'My machines' }} />
        <Stack.Screen name="QrScanner" component={QrScanner} options={{ title: 'Scan' }} />
        <Stack.Screen
          name="MediaPicker"
          component={MediaPicker}
          options={{ headerShown: false, presentation: 'transparentModal' as any }}
        />
        <Stack.Screen
          name="ChatInterface"
          component={ChatInterface}
          options={({ route, navigation }: any) => {
            const params: any = route?.params ?? {};
            const name: string = params.title || 'Strand';
            return {
              // The header is the way in to everything *about* a strand —
              // members, muting, leaving (navigation.md).  It must look
              // tappable: the status strip alone reads as a passive label.
              headerTitle: () => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${name} — strand details`}
                  onPress={() => navigation.navigate('StrandDetail', {
                    strandId: params.strandId, title: params.title,
                  })}
                  style={{ flexDirection: 'row', alignItems: 'center' }}
                >
                  <View style={{ marginRight: 8 }}>
                    <Avatar name={name} uri={params.avatarUri} size="sm" />
                  </View>
                  <View>
                    <Text numberOfLines={1} style={{ maxWidth: 180, ...typography.title, color: theme.textPrimary }}>
                      {name}
                    </Text>
                    <Text numberOfLines={1} style={{ ...typography.small, color: theme.textMuted }}>
                      {params.isGroup && params.memberCount
                        ? `${params.memberCount} people · details`
                        : 'details'}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={14} color={theme.textMuted} style={{ marginLeft: 4 }} />
                </Pressable>
              ),
              headerRight: () => (
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  {/* Calls are parked (story 90) — kept visible so the objective
                      is not forgotten, honest about not being built. */}
                  <IconButton name="call-outline" size={20} accessibilityLabel="Voice call" onPress={() => showToast('Calls are not built yet')} />
                  <IconButton name="search-outline" size={20} accessibilityLabel="Search in strand"
                    onPress={() => navigation.navigate('SearchInterface', { strandId: params.strandId })} />
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
 *  matches the rest of the app instead of its built-in defaults.
 *
 *  On mocks there is no cadre to read, and the component would sit on its own
 *  loading state forever.  Say so instead — the consolidation is explicit that
 *  this screen must never block (design/generated/mobile/screens/CadreManager.md).
 *  We do NOT reimplement any of the component here; we simply do not mount it
 *  when there is nothing behind it. */
function ThemedCadreManager() {
  const theme = useTheme();

  if (!USE_SEREUS) {
    return (
      <View style={{ flex: 1, padding: 16, gap: 8, backgroundColor: theme.background }}>
        <Text style={{ ...typography.title, color: theme.textPrimary }}>
          Your machines live on the real network
        </Text>
        <Text style={{ ...typography.body, color: theme.textMuted, lineHeight: 22 }}>
          This build is running on sample data, so there is no cadre to show. On the live network
          this is where you would see what acts for you, and add something that stays awake so your
          messages keep moving while your phone is asleep.
        </Text>
      </View>
    );
  }

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
