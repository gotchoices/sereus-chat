/**
 * RelayOffer — somebody is offering a relay; decide whether to use it.
 * Spec: design/specs/mobile/screens/relay-offer.md
 *
 * This screen PROPOSES.  Nothing is applied until the user accepts: any web
 * page can emit a relay link, and the cost of a bad one is invisible afterwards
 * (story 42).
 */

import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { orThrow, useModel } from '../data/bind';
import { useErrorText, useT } from '../i18n';
import { Banner } from '../components';
import { useTheme, typography, spacing, radius } from '../theme';

/** Host and peer id straight out of the multiaddr; no other claim is checkable. */
function parseAddr(addr: string): { host: string | null; peerId: string | null } {
  const parts = addr.split('/').filter(Boolean);
  let host: string | null = null;
  let peerId: string | null = null;
  for (let i = 0; i < parts.length - 1; i++) {
    if (['dns4', 'dns6', 'dnsaddr', 'ip4', 'ip6'].includes(parts[i])) host = parts[i + 1];
    if (parts[i] === 'p2p') peerId = parts[i + 1];
  }
  return { host, peerId };
}

export default function RelayOffer() {
  const model = useModel();
  const navigation: any = useNavigation();
  const route: any = useRoute();
  const addr: string = route?.params?.addr ?? '';
  const claimedName: string | undefined = route?.params?.name;
  const t = useT();
  const errorText = useErrorText();
  const theme = useTheme();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { host, peerId } = useMemo(() => parseAddr(addr), [addr]);
  // Without a pinned identity there is no guarantee at all, so refuse it.
  const usable = !!addr && !!peerId;

  const accept = async () => {
    setBusy(true);
    try {
      const prefs = orThrow(await model.prefs.get());
      const next = prefs.relayAddrs.includes(addr)
        ? prefs.relayAddrs
        : [...prefs.relayAddrs, addr];   // append, never replace
      orThrow(await model.prefs.set({ relayAddrs: next }));
      // Back to whatever sent them looking — usually the invitation they were
      // making (story 42 step 6: "His invitation works"), which re-checks its
      // reachability on focus. Only a cold arrival, with nothing underneath,
      // goes to the machines screen, where the relay's status is shown.
      if (navigation.canGoBack()) navigation.goBack();
      else navigation.replace('CadreManager');
    } catch (e: any) {
      setError(errorText(e, 'That relay could not be saved'));
      setBusy(false);
    }
  };

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.content}>
      {error ? <Banner message={error} /> : null}

      {!usable ? (
        <View style={[styles.card, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}>
          <Text style={[typography.title, { color: theme.textPrimary }]}>
            {t('relay.badTitle')}
          </Text>
          <Text style={[typography.body, { color: theme.textMuted }]}>
            {t('relay.badBody')}
          </Text>
        </View>
      ) : (
        <>
          <Text style={[typography.title, { color: theme.textPrimary }]}>
            {t('relay.title')}
          </Text>
          <Text style={[typography.body, styles.lede, { color: theme.textMuted }]}>
            {t('relay.lede')}
          </Text>

          <View style={[styles.card, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}>
            {claimedName ? (
              <>
                <Text style={[typography.body, styles.strong, { color: theme.textPrimary }]}>
                  {claimedName}
                </Text>
                <Text style={[typography.small, { color: theme.textMuted }]}>
                  {t('relay.claimed')}
                </Text>
              </>
            ) : null}
            <Text style={[typography.small, styles.row, { color: theme.textMuted }]}>
              {t('relay.host')}: <Text style={{ color: theme.textPrimary }}>{host ?? '—'}</Text>
            </Text>
            <Text style={[typography.small, { color: theme.textMuted }]} numberOfLines={1}>
              {t('relay.peer')}: <Text style={{ color: theme.textPrimary }}>{peerId}</Text>
            </Text>
            <Text style={[typography.small, styles.row, { color: theme.textMuted }]}>
              {t('relay.pinned')}
            </Text>
          </View>

          <View style={[styles.card, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}>
            <Text style={[typography.body, { color: theme.textPrimary }]}>
              {t('relay.cost')}
            </Text>
            <Text style={[typography.small, { color: theme.textMuted }]}>
              {t('relay.costNote')}
            </Text>
          </View>

          <View style={styles.actions}>
            <Pressable onPress={() => navigation.goBack()}
              style={[styles.btn, { borderColor: theme.border, backgroundColor: theme.surface }]}>
              <Text style={[typography.body, styles.strong, { color: theme.textPrimary }]}>
                {t('relay.decline')}
              </Text>
            </Pressable>
            <Pressable onPress={accept} disabled={busy}
              style={[styles.btn, { borderColor: theme.accent, backgroundColor: theme.accent }, busy && styles.dim]}>
              <Text style={[typography.body, styles.strong, { color: theme.accentText }]}>
                {t('relay.accept')}
              </Text>
            </Pressable>
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing[3], gap: spacing[2] },
  lede: { lineHeight: 22 },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.card, padding: spacing[3], gap: spacing[1] },
  row: { paddingTop: spacing[1] },
  strong: { fontWeight: '600' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing[2], paddingTop: spacing[2] },
  btn: { paddingVertical: spacing[2], paddingHorizontal: spacing[3], borderRadius: radius.control, borderWidth: StyleSheet.hairlineWidth },
  dim: { opacity: 0.5 },
});
