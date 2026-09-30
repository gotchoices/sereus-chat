import React from 'react';
import { NavigationContainer, DefaultTheme, DarkTheme, useFocusEffect } from '@react-navigation/native';
import type { LinkingOptions } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View, Text, Pressable, ScrollView, StyleSheet, Linking, Image } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { getProfile } from '../data/adapter';
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
import Diagnostics from '../screens/Diagnostics';
import ChatInterface from '../screens/ChatInterface';
import MediaPicker from '../screens/MediaPicker';
import { CadreManager } from '../cadre-ui';
import { cadreService } from '../cadre';
import { Avatar, IconButton } from '../components';
import { getPrefs, setPrefs } from '../data/adapter';
import { useTheme, useThemeContext, typography, radius } from '../theme';
import { USE_SEREUS } from '../data/config';

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  const theme = useTheme();
  const { scheme } = useThemeContext();

  /**
   * FIRST LAUNCH ASKS FOR A NAME (story 01, steps 2-3). The gate is whether a
   * name has ever been set, NOT whether the user has strands — "a returning user
   * with still no strands is not nagged" is its own acceptance criterion, and
   * someone who has named themselves and is waiting for their first invitation
   * has done everything first run asks of them.
   *
   * `null` means we have not looked yet, and nothing is rendered until we have:
   * mounting the strand list first and then pushing Profile over it would show
   * the new user an empty conversation list before asking who they are, which is
   * the wrong order and looks like a glitch.
   */
  const [firstRun, setFirstRun] = React.useState<boolean | null>(null);
  React.useEffect(() => {
    let alive = true;
    getProfile()
      .then(p => { if (alive) setFirstRun(!p?.name?.trim()); })
      // Unreadable profile: treat as a returning user rather than trapping them
      // behind a form they may have already filled in.
      .catch(() => { if (alive) setFirstRun(false); });
    return () => { alive = false; };
  }, []);

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
        Diagnostics: 'diagnostics',
        RelayOffer: 'relay',
      },
    },
  };

  // Nothing to draw until we know which of the two openings this is.
  if (firstRun === null) return null;

  return (
    <NavigationContainer linking={linking} theme={navTheme}>
      <Stack.Navigator
        screenOptions={screenOptions}
        initialRouteName={firstRun ? 'Profile' : 'StrandList'}
      >
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
        {/* Dev-only: stack checks inside RN.  Registered unconditionally (a route
            nobody navigates to costs nothing); the ENTRY is __DEV__-gated. */}
        <Stack.Screen name="Diagnostics" component={Diagnostics} options={{ title: 'Diagnostics' }} />
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

  // Re-read on every focus, not once: accepting a relay on the offer screen
  // returns HERE, and a mount-only read left "No relay yet" on screen beside a
  // node that had just become reachable through the relay it names.
  useFocusEffect(React.useCallback(() => {
    getPrefs().then(p => setAddrs(p.relayAddrs ?? [])).catch(() => {});
  }, []));

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
          No relay yet. A phone cannot accept connections from the Internet on its own, so nobody
          you invite can answer until you have one — a machine with a public address that passes
          connections through to your phone.
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
      {/* Real buttons, not an accent-coloured line of text, which did not read as
          tappable. Equal, and in the stories' order, as on the invite screen. */}
      {addrs.length === 0 ? (
        <>
          <RelayLinkButton label="Run your own relay"
            url="https://sereus.org/chat/relays.html#own" />
          <RelayLinkButton label="Use an open relay"
            url="https://sereus.org/chat/relays.html#borrow" />
        </>
      ) : (
        <RelayLinkButton label="Find another relay" url="https://sereus.org/chat/relays.html" />
      )}
    </View>
  );
}

function RelayLinkButton({ label, url }: { label: string; url: string }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => Linking.openURL(url)}
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8,
        paddingVertical: 12, paddingHorizontal: 16, borderRadius: radius.control,
        borderWidth: StyleSheet.hairlineWidth, borderColor: theme.border,
        backgroundColor: theme.surface, opacity: pressed ? 0.7 : 1,
      })}
    >
      <Text style={{ ...typography.body, fontWeight: '600', color: theme.textPrimary }}>
        {label}
      </Text>
      <Ionicons name="open-outline" size={18} color={theme.textMuted} />
    </Pressable>
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
