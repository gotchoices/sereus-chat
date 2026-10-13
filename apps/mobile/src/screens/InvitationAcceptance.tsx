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
import { View, Text, ScrollView, Pressable, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { InvitationPreview } from '@chat/core';
import { orThrow, useModel } from '../data/bind';
import { useErrorText, useT } from '../i18n';
import { useDataRevision } from '../mock/VariantContext';
import { Avatar, Banner, IconButton, StrandStatus, strandStatusKind } from '../components';
import { useTheme, typography, spacing, radius } from '../theme';

export default function InvitationAcceptance() {
  const model = useModel();
  const route: any = useRoute();
  const navigation: any = useNavigation();
  const t = useT();
  const errorText = useErrorText();
  const rev = useDataRevision();
  const theme = useTheme();
  const token: string = route?.params?.token || '';

  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setPreview(orThrow(await model.invitations.inspect(token))); setError(null); }
    catch (e: any) { setError(errorText(e, 'That invitation could not be read')); }
  }, [model, token, errorText]);

  useEffect(() => { void load(); }, [load, rev]);

  const accept = async () => {
    setBusy(true);
    try {
      const { strandId } = orThrow(await model.invitations.accept(token));
      navigation.replace('ChatInterface', { strandId });
    } catch (e: any) {
      // Dev-only: accepting crosses the network into cadre-core's formation
      // protocol, and the surfaced message ("Responder result failed validation")
      // names a verdict, not a site. The stack is what makes it actionable.
      if (__DEV__) console.warn('[accept] failed:', e?.name, e?.message, '\nstack:', e?.stack);
      setError(errorText(e, 'That invitation could not be used'));
    } finally { setBusy(false); }
  };

  // Declining creates nothing and tells nobody — there was never an identity
  // attached to the invitation, only whoever happened to hold it.
  const decline = () => navigation.navigate('StrandList');

  const askToClose = () =>
    Alert.alert(
      t('accept.askTitle'),
      t('accept.askBody'),
      [{ text: t('common.ok') }],
    );

  const dead = preview && preview.status !== 'live';

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.content}>
      {error ? <Banner message={error} action={{ label: t('common.retry'), onPress: load }} /> : null}

      {dead ? (
        // Not the user's mistake, and no retry that could not work.
        <View style={[styles.card, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}>
          <Text style={[typography.title, { color: theme.textPrimary }]}>
            {preview!.status === 'spent'
              ? t('accept.spent')
              : preview!.status === 'expired'
                ? t('accept.expired')
                : preview!.status === 'cancelled'
                  ? t('accept.cancelled')
                  : t('accept.invalid')}
          </Text>
          <Text style={[typography.body, { color: theme.textMuted }]}>
            {t('accept.deadBody')}
          </Text>
          <IconButton name="arrow-back-outline" size={22} variant="bordered"
            accessibilityLabel={t('common.back')} onPress={decline} />
        </View>
      ) : preview ? (
        <>
          {/* 1. Who is inviting — only as they have disclosed themselves, which
              may be not at all.  An invitation is a bearer token: it carries no
              identity, and whoever holds it can pass it on.  When nothing has
              been disclosed we say so rather than leaving a blank where a name
              would go, because a blank reads as a loading failure and invites
              the reader to assume the app knows more than it does. */}
          <View style={styles.who}>
            <Avatar name={preview.inviterName || '?'} uri={preview.inviterAvatarUri} size="lg" />
            <View style={styles.flex1}>
              <Text style={[typography.title, { color: theme.textPrimary }]}>
                {preview.inviterName ||
                  t('accept.unattributed')}
              </Text>
              <Text style={[typography.small, { color: theme.textMuted }]}>
                {preview.inviterName
                  ? t('accept.invitesYou')
                  : t('accept.invitesYouUnattributed')}
              </Text>
            </View>
          </View>

          {/* 2. What the strand is — the whole point of this screen. */}
          <StrandStatus state={preview.strandState} variant="full" testID="invite-status" />

          {/* 3. What you will be taking on.  Said for every strand, not only groups. */}
          <View style={[styles.card, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}>
            <Text style={[typography.body, { color: theme.textPrimary }]}>
              {t('accept.history')}
            </Text>
            <Text style={[typography.small, { color: theme.textMuted }]}>
              {preview.grantsInviteRight
                ? t('accept.canInvite')
                : t('accept.cannotInvite')}
            </Text>
          </View>

          {/* 4. Only now, the decision.  Both choices carry words: this is the
              most consequential decision in the app, and a bare tick and cross
              would make somebody guess at it. */}
          <View style={styles.actions}>
            <Pressable onPress={decline}
              style={[styles.btn, { borderColor: theme.border, backgroundColor: theme.surface }]}>
              <Text style={[typography.body, styles.btnText, { color: theme.textPrimary }]}>
                {t('accept.decline')}
              </Text>
            </Pressable>
            <Pressable onPress={accept} disabled={busy}
              style={[styles.btn, styles.btnRow, { borderColor: theme.accent, backgroundColor: theme.accent }, busy && styles.dim]}>
              {busy ? <ActivityIndicator color={theme.accentText} /> : null}
              <Text style={[typography.body, styles.btnText, { color: theme.accentText }]}>
                {t('accept.accept')}
              </Text>
            </Pressable>
          </View>
          {/* Joining reaches the other person's phone and copies the conversation
              so far; on a slow phone that has been measured at minutes. Without
              this, a dimmed button is the only sign anything is happening. */}
          {busy ? (
            <Text style={[typography.small, styles.note, { color: theme.textMuted }]}>
              {t('accept.joining')}
            </Text>
          ) : null}

          {strandStatusKind(preview.strandState) === 'canChange' ? (
            <Text
              accessibilityRole="button"
              onPress={askToClose}
              style={[typography.small, styles.ask, { color: theme.accent }]}
            >
              {t('accept.askLink')}
            </Text>
          ) : null}

          <Text style={[typography.small, styles.note, { color: theme.textMuted }]}>
            {t('accept.decliningNote')}
          </Text>
        </>
      ) : !error ? (
        // Reading the invitation is local but not instant on a slow phone, and a
        // blank screen reads as broken.
        <ActivityIndicator style={styles.loading} color={theme.textMuted} />
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
  btnRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[1] },
  loading: { paddingTop: spacing[5] },
});
