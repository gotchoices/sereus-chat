import React from 'react';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import type { LinkingOptions } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View, Text, Pressable, ScrollView, StyleSheet, Linking, Image } from 'react-native';
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
import RelayOffer from '../screens/RelayOffer';
import QrScanner from '../screens/QrScanner';
import ChatInterface from '../screens/ChatInterface';
import MediaPicker from '../screens/MediaPicker';
import { CadreManager } from '../cadre-ui';
import { cadreService } from '../cadre';
import { Avatar, IconButton } from '../components';
import { getPrefs, setPrefs } from '../data/adapter';
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
    // App Links carry offers arriving from the web (browsers block custom
    // schemes); the custom scheme serves QR codes, in-app links and testing.
    prefixes: ['https://sereus.org/chat', 'sereus://', 'chat://'],
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
        RelayOffer: 'relay',
      },
    },
  };

  return (
    <NavigationContainer linking={linking} theme={navTheme}>
      <Stack.Navigator screenOptions={screenOptions}>
        <Stack.Screen
          name="StrandList"
          component={StrandList}
          options={{
            title: 'Strands',
            // The one branded corner in the app — the mark on the home header,
            // the way ser/health carries its logo. Decorative only.
            headerLeft: () => (
              <Image
                source={require('../assets/logo.png')}
                style={{ width: 26, height: 26, marginRight: 8, resizeMode: 'contain' }}
                accessibilityRole="image"
                accessibilityLabel="Sereus Chat"
              />
            ),
          }}
        />
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
        <Stack.Screen name="CadreManager" component={ThemedCadreManager} options={{ title: 'My network' }} />
        <Stack.Screen
          name="RelayOffer"
          component={RelayOffer}
          options={{ title: 'Relay', presentation: 'modal' as any }}
        />
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
/** Chat's own section, rendered below the shared component — the seam its own
 *  SPEC sanctions (health uses it for guests).  Relays are how the user is
 *  reachable; a borrowed relay is not one of their machines, which is why the
 *  screen is "My network" rather than "My machines". */
function RelaySection() {
  const theme = useTheme();
  const [addrs, setAddrs] = React.useState<string[]>([]);
  const [status, setStatus] = React.useState<string | null>(null);

  React.useEffect(() => { getPrefs().then(p => setAddrs(p.relayAddrs ?? [])).catch(() => {}); }, []);

  /* Listing a relay under "How you are reachable" is a claim, and a configured
     relay is not a working one: the reservation is granted by the relay and can
     be lost again afterwards.  So the posture is read live rather than inferred
     from the fact that an address is saved. */
  React.useEffect(() => {
    if (!USE_SEREUS) return;
    let alive = true;
    const read = () => {
      const st = cadreService.getRelayReservationState();
      if (alive) setStatus(st ? st.status : null);
    };
    read();
    const id = setInterval(read, 4000);
    return () => { alive = false; clearInterval(id); };
  }, [addrs]);

  const drop = async (a: string) => {
    const next = addrs.filter(x => x !== a);
    setAddrs(next);
    await setPrefs({ relayAddrs: next }).catch(() => {});
  };

  const short = (a: string) => {
    const p = a.split('/').filter(Boolean);
    const hostAt = p.findIndex(x => ['dns4', 'dns6', 'dnsaddr', 'ip4', 'ip6'].includes(x));
    const peerAt = p.indexOf('p2p');
    const host = hostAt >= 0 ? p[hostAt + 1] : a;
    const peer = peerAt >= 0 ? p[peerAt + 1] : '';
    return peer ? `${host} · ${peer.slice(0, 10)}…` : host;
  };

  return (
    <View style={{ padding: 16, gap: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }}>
      <Text style={{ ...typography.small, color: theme.textSecondary, textTransform: 'uppercase' }}>
        How you are reachable
      </Text>
      {addrs.length === 0 ? (
        <Text style={{ ...typography.body, color: theme.textMuted, lineHeight: 22 }}>
          Nothing yet. A phone on its own has no address the world can reach, so nobody you invite
          can answer. Borrow a relay to get started, or run a machine of your own.
        </Text>
      ) : (
        addrs.map(a => (
          <View key={a} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text numberOfLines={1} style={{ flex: 1, ...typography.body, color: theme.textPrimary }}>
              {short(a)}
            </Text>
            <IconButton name="trash-outline" size={18} accessibilityLabel="Stop using this relay"
              onPress={() => drop(a)} />
          </View>
        ))
      )}
      {addrs.length > 0 && status && status !== 'none' ? (
        <Text style={{ ...typography.small, color: status === 'reserved' ? theme.textSecondary : theme.textMuted }}>
          {status === 'reserved'
            ? 'Working — people can reach you through this.'
            : status === 'dialing'
              ? 'Connecting…'
              : 'Not working yet. Still trying — you are not reachable until it does.'}
        </Text>
      ) : null}
      <Text
        accessibilityRole="button"
        onPress={() => Linking.openURL('https://sereus.org/chat/relays.html')}
        style={{ ...typography.small, color: theme.accent, paddingTop: 4 }}
      >
        Find a relay →
      </Text>
    </View>
  );
}

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
    <ScrollView style={{ flex: 1, backgroundColor: theme.background }}>
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
    <RelaySection />
    </ScrollView>
  );
}
