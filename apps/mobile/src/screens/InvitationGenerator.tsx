/**
 * InvitationGenerator — start a strand, or add somebody to one.
 * Spec: design/specs/mobile/screens/invitation-generator.md
 *
 * Nothing here may render a not-yet-accepted invitation as though it were a
 * strand: there is no strand until somebody accepts.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Share, Alert } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { createInvitation, listOutstandingInvitations, cancelInvitation } from '../data/adapter';
import type { Invitation } from '../data/types';
import { useT } from '../i18n';
import { Banner, IconButton, ListRow, SectionHeader } from '../components';
import { useTheme, typography, spacing, radius } from '../theme';

export default function InvitationGenerator() {
  const navigation: any = useNavigation();
  const route: any = useRoute();
  const strandId: string | undefined = route?.params?.strandId;
  const addingToExisting = !!strandId;
  const t = useT();
  const theme = useTheme();

  const [visibility, setVisibility] = useState<'private' | 'public'>('private');
  const [grantsInviteRight, setGrants] = useState(false);
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [outstanding, setOutstanding] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    listOutstandingInvitations().then(setOutstanding).catch(() => {});
  }, []);
  useEffect(refresh, [refresh]);

  const generate = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      setInvitation(await createInvitation({
        strandId,
        visibility: addingToExisting ? undefined : visibility,
        grantsInviteRight,
      }));
      refresh();
    } catch (err) {
      setInvitation(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [strandId, addingToExisting, visibility, grantsInviteRight, refresh]);

  const postIntoStrand = () =>
    Alert.alert(
      t('screens.invite.postTitle', 'Put it in the conversation?'),
      // An invitation works for whoever holds it.
      t('screens.invite.postBody',
        'Everyone in this strand will be able to use it. That hands every member a one-off ability to bring somebody in. If you can reach the person another way, do that instead.'),
      [{ text: t('common.cancel', 'Cancel'), style: 'cancel' }, { text: t('screens.invite.post', 'Post it') }],
    );

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.content}>
      {error ? <Banner message={error} action={{ label: t('common.retry', 'Retry'), onPress: generate }} /> : null}

      {!addingToExisting ? (
        <>
          <SectionHeader label={t('screens.invite.kind', 'What kind of strand')} />
          {(['private', 'public'] as const).map(v => (
            <Pressable key={v} onPress={() => setVisibility(v)}
              style={[styles.card, { borderColor: visibility === v ? theme.accent : theme.border, backgroundColor: theme.surfaceAlt }]}>
              <Text style={[typography.body, styles.cardTitle, { color: theme.textPrimary }]}>
                {v === 'private' ? t('screens.invite.private', 'Private') : t('screens.invite.public', 'Open to anyone')}
              </Text>
              <Text style={[typography.small, { color: theme.textMuted }]}>
                {v === 'private'
                  ? t('screens.invite.privateBody', 'Only people you invite can be in it.')
                  : t('screens.invite.publicBody', 'Anyone with the link can join, and nobody can be removed.')}
              </Text>
            </Pressable>
          ))}
        </>
      ) : (
        <Banner
          variant="info"
          message={t('screens.invite.historyWarning',
            'Whoever takes this up will be able to read everything already said here, including what was said before they arrived.')}
        />
      )}

      <SectionHeader label={t('screens.invite.rights', 'On this invitation')} />
      <Pressable onPress={() => setGrants(g => !g)}
        style={[styles.card, { borderColor: grantsInviteRight ? theme.accent : theme.border, backgroundColor: theme.surfaceAlt }]}>
        <Text style={[typography.body, styles.cardTitle, { color: theme.textPrimary }]}>
          {grantsInviteRight
            ? t('screens.invite.canInviteOn', 'They can add and remove people')
            : t('screens.invite.canInviteOff', 'They cannot add or remove anyone')}
        </Text>
        <Text style={[typography.small, { color: theme.textMuted }]}>
          {t('screens.invite.rightsBody',
            'Passing this on gives them the same reach you have — including over you.')}
        </Text>
      </Pressable>

      <View style={styles.actions}>
        <IconButton name="qr-code-outline" size={22} variant="accent"
          accessibilityLabel={t('screens.invite.generate', 'Make an invitation')}
          onPress={generate} style={loading ? styles.dim : undefined} />
      </View>

      {invitation ? (
        <View style={[styles.card, { borderColor: theme.border, backgroundColor: theme.surfaceAlt }]}>
          <Text style={[typography.small, { color: theme.textMuted }]} selectable>{invitation.url}</Text>
          <Text style={[typography.small, { color: theme.textMuted }]}>
            {t('screens.invite.nothingYet', 'Nothing exists yet — there is no strand until somebody accepts.')}
          </Text>
          <View style={styles.shareRow}>
            <IconButton name="copy-outline" size={20} accessibilityLabel={t('common.copy', 'Copy')} onPress={() => {}} />
            <IconButton name="share-outline" size={20} accessibilityLabel={t('common.share', 'Share')}
              onPress={() => Share.share({ message: invitation.url })} />
            {addingToExisting ? (
              <IconButton name="chatbubble-outline" size={20}
                accessibilityLabel={t('screens.invite.post', 'Post into the strand')} onPress={postIntoStrand} />
            ) : null}
          </View>
        </View>
      ) : null}

      {outstanding.length ? (
        <>
          <SectionHeader label={t('screens.invite.outstanding', 'Still outstanding')} />
          <View style={styles.rows}>
            {outstanding.map(inv => (
              <ListRow
                key={inv.id}
                title={inv.label ?? inv.url}
                subtitle={inv.expiresAt
                  ? t('screens.invite.expires', 'Runs out {{when}}').replace('{{when}}', new Date(inv.expiresAt).toLocaleDateString())
                  : undefined}
                onPress={() => Alert.alert(inv.label ?? t('screens.strands.invitation', 'Invitation'), undefined, [
                  { text: t('common.share', 'Share again'), onPress: () => Share.share({ message: inv.url }) },
                  { text: t('screens.invite.abandon', 'Abandon'), style: 'destructive',
                    onPress: () => cancelInvitation(inv.id).then(refresh).catch(() => {}) },
                  { text: t('common.cancel', 'Cancel'), style: 'cancel' },
                ])}
              />
            ))}
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing[3], gap: spacing[1], paddingBottom: spacing[5] },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.card, padding: spacing[2], gap: 4 },
  cardTitle: { fontWeight: '600' },
  actions: { alignItems: 'center', paddingVertical: spacing[2] },
  shareRow: { flexDirection: 'row', gap: spacing[1], paddingTop: spacing[1] },
  rows: { gap: spacing[1] },
  dim: { opacity: 0.5 },
});
