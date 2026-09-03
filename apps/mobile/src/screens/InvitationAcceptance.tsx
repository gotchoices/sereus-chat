/**
 * InvitationAcceptance — see what you are being asked to join, then decide.
 * Spec: design/specs/mobile/screens/invitation-acceptance.md
 *
 * This is the most important placement of StrandStatus in the app: it is the
 * one moment somebody can judge a strand *before* disclosing themselves.  The
 * order below is deliberate and should not be rearranged — who is inviting,
 * what the strand is, what you will be taking on, and only then the buttons.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Alert } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { inspectInvitation, acceptInvitation } from '../data/adapter';
import type { InvitationPreview } from '../data/types';
import { useT } from '../i18n';
import { useDataRevision } from '../mock/VariantContext';
import { Avatar, Banner, IconButton, StrandStatus, strandStatusKind } from '../components';
import { useTheme, typography, spacing, radius } from '../theme';

export default function InvitationAcceptance() {
  const route: any = useRoute();
  const navigation: any = useNavigation();
  const t = useT();
  const rev = useDataRevision();
  const theme = useTheme();
  const token: string = route?.params?.token || '';

  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setPreview(await inspectInvitation(token)); setError(null); }
    catch (e: any) { setError(e?.message ?? 'That invitation could not be read'); }
  }, [token]);

  useEffect(() => { void load(); }, [load, rev]);

  const accept = async () => {
    setBusy(true);
    try {
      const { strandId } = await acceptInvitation(token);
      navigation.replace('ChatInterface', { strandId });
    } catch (e: any) {
      setError(e?.message ?? 'That invitation could not be used');
    } finally { setBusy(false); }
  };

  // Declining creates nothing and tells nobody — there was never an identity
  // attached to the invitation, only whoever happened to hold it.
  const decline = () => navigation.navigate('StrandList');

  const askToClose = () =>
    Alert.alert(
      t('screens.accept.askTitle', 'Ask them to close it first'),
      t('screens.accept.askBody',
        'There is nothing to send. Ask them the way you would ask anybody — the app carries no request and will not chase them. If they agree, this will say the membership is settled.'),
      [{ text: t('common.ok', 'OK') }],
    );

  const dead = preview && preview.status !== 'live';

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.content}>
      {error ? <Banner message={error} action={{ label: t('common.retry', 'Retry'), onPress: load }} /> : null}

      {dead ? (
        // Not the user's mistake, and no retry that could not work.
        <View style={[styles.card, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}>
          <Text style={[typography.title, { color: theme.textPrimary }]}>
            {preview!.status === 'spent'
              ? t('screens.accept.spent', 'This invitation has already been used')
              : preview!.status === 'expired'
                ? t('screens.accept.expired', 'This invitation has run out')
                : preview!.status === 'cancelled'
                  ? t('screens.accept.cancelled', 'This invitation was withdrawn')
                  : t('screens.accept.invalid', 'This is not an invitation we can read')}
          </Text>
          <Text style={[typography.body, { color: theme.textMuted }]}>
            {t('screens.accept.deadBody',
              'An invitation works once. Ask whoever sent it for another one.')}
          </Text>
          <IconButton name="arrow-back-outline" size={22} variant="bordered"
            accessibilityLabel={t('common.back', 'Back')} onPress={decline} />
        </View>
      ) : preview ? (
        <>
          {/* 1. Who is inviting — only as they have disclosed themselves. */}
          <View style={styles.who}>
            <Avatar name={preview.inviterName} uri={preview.inviterAvatarUri} size="lg" />
            <View style={styles.flex1}>
              <Text style={[typography.title, { color: theme.textPrimary }]}>{preview.inviterName}</Text>
              <Text style={[typography.small, { color: theme.textMuted }]}>
                {t('screens.accept.invitesYou', 'invites you to a strand')}
              </Text>
            </View>
          </View>

          {/* 2. What the strand is — the whole point of this screen. */}
          <StrandStatus state={preview.strandState} variant="full" testID="invite-status" />

          {/* 3. What you will be taking on.  Said for every strand, not only groups. */}
          <View style={[styles.card, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}>
            <Text style={[typography.body, { color: theme.textPrimary }]}>
              {t('screens.accept.history',
                'If you join, you will be able to read everything already said here — including anything said before you arrived.')}
            </Text>
            <Text style={[typography.small, { color: theme.textMuted }]}>
              {preview.grantsInviteRight
                ? t('screens.accept.canInvite', 'You would be able to add and remove people.')
                : t('screens.accept.cannotInvite', 'You would not be able to add or remove anyone.')}
            </Text>
          </View>

          {/* 4. Only now, the decision.  Both choices carry words: this is the
              most consequential decision in the app, and a bare tick and cross
              would make somebody guess at it. */}
          <View style={styles.actions}>
            <Pressable onPress={decline}
              style={[styles.btn, { borderColor: theme.border, backgroundColor: theme.surface }]}>
              <Text style={[typography.body, styles.btnText, { color: theme.textPrimary }]}>
                {t('screens.accept.decline', 'No thanks')}
              </Text>
            </Pressable>
            <Pressable onPress={accept} disabled={busy}
              style={[styles.btn, { borderColor: theme.accent, backgroundColor: theme.accent }, busy && styles.dim]}>
              <Text style={[typography.body, styles.btnText, { color: theme.accentText }]}>
                {t('screens.accept.accept', 'Join this strand')}
              </Text>
            </Pressable>
          </View>

          {strandStatusKind(preview.strandState) === 'canChange' ? (
            <Text
              accessibilityRole="button"
              onPress={askToClose}
              style={[typography.small, styles.ask, { color: theme.accent }]}
            >
              {t('screens.accept.askLink', 'Or ask them to close it first')}
            </Text>
          ) : null}

          <Text style={[typography.small, styles.note, { color: theme.textMuted }]}>
            {t('screens.accept.decliningNote',
              'Declining creates nothing, and they are not told who declined.')}
          </Text>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing[3], gap: spacing[2] },
  who: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], paddingVertical: spacing[2] },
  flex1: { flex: 1 },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.card, padding: spacing[3], gap: spacing[1] },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing[2], paddingTop: spacing[2] },
  btn: {
    paddingVertical: spacing[2], paddingHorizontal: spacing[3],
    borderRadius: radius.control, borderWidth: StyleSheet.hairlineWidth,
  },
  btnText: { fontWeight: '600' },
  ask: { textAlign: 'center', paddingTop: spacing[1] },
  note: { textAlign: 'center', lineHeight: 18, paddingTop: spacing[2] },
  dim: { opacity: 0.5 },
});
