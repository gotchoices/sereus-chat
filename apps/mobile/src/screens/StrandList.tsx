/**
 * StrandList — home.  Every strand the user belongs to.
 * Spec: design/specs/mobile/screens/strand-list.md
 * Consolidation: design/generated/mobile/screens/StrandList.md
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, SectionList, StyleSheet, RefreshControl, Alert } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { listStrands, listOutstandingInvitations } from '../data/adapter';
import type { StrandSummary, Invitation } from '../data/types';
import { useT } from '../i18n';
import { useDataRevision } from '../mock/VariantContext';
import { Avatar, ListRow, Badge, EmptyState, Banner, IconButton, SectionHeader } from '../components';
import { useTheme, spacing } from '../theme';

type SortMode = 'recent' | 'alpha' | 'unread';

/** Relative under a day, date beyond. */
function when(iso?: string | null): string {
  if (!iso) return '';
  const d = Date.parse(iso);
  const mins = Math.floor((Date.now() - d) / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  if (mins < 60 * 24) return `${Math.floor(mins / 60)}h`;
  return new Date(d).toLocaleDateString();
}

/**
 * A row shows at most ONE indicator: mention → unread → draft → muted.
 * Being named is the only thing that should interrupt; an unread count on a
 * muted strand re-creates the pressure muting removed.
 */
function indicatorFor(s: StrandSummary): React.ReactNode {
  if (s.mentioned) return <Badge mode="mention" />;
  if (s.unreadCount > 0 && s.muted === 'none') return <Badge mode="count" count={s.unreadCount} />;
  // No draft badge: the row's preview already reads "Draft: …", and saying it
  // twice is noise.  The slot goes to the mute state instead.
  if (s.muted !== 'none') return <Badge mode="muted" />;
  return undefined;
}

export default function StrandList() {
  const navigation: any = useNavigation();
  const t = useT();
  const rev = useDataRevision();
  const theme = useTheme();
  const [strands, setStrands] = useState<StrandSummary[]>([]);
  const [invites, setInvites] = useState<Invitation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('recent');

  const load = useCallback(async () => {
    try {
      const [s, i] = await Promise.all([
        listStrands(),
        listOutstandingInvitations().catch(() => [] as Invitation[]),
      ]);
      setStrands(s);
      setInvites(i);
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'Could not reach your strands right now');
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));
  useEffect(() => { void load(); }, [load, rev]);

  const sections = useMemo(() => {
    const active = strands.filter(s => !s.archived && !s.pending);
    const archived = strands.filter(s => s.archived);

    const sorted = [...active].sort((a, b) => {
      if (sortMode === 'alpha') return a.title.localeCompare(b.title);
      if (sortMode === 'unread') {
        const av = a.mentioned ? 1e9 : a.unreadCount;
        const bv = b.mentioned ? 1e9 : b.unreadCount;
        return bv - av || a.title.localeCompare(b.title);
      }
      // Muted strands are not promoted by ordinary traffic — they keep their
      // place rather than jumping the list every time somebody talks.  Being
      // NAMED is not ordinary traffic: a soft mute exists precisely to let a
      // mention through, so it must be able to surface the row.  Only a hard
      // mute stays put no matter what, because that is what was asked for.
      const rank = (x: StrandSummary) =>
        x.muted === 'hard' ? 0 : x.mentioned || x.muted === 'none'
          ? Date.parse(x.lastMessage?.timestamp ?? '0')
          : 0;
      return rank(b) - rank(a);
    });

    const out: Array<{ title: string | null; data: any[] }> = [];
    if (invites.length) out.push({ title: t('screens.strands.pending', 'Pending'), data: invites });
    out.push({ title: null, data: sorted });
    if (archived.length) out.push({ title: t('screens.strands.archived', 'Archived'), data: archived });
    return out;
  }, [strands, invites, sortMode, t]);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const rowActions = (s: StrandSummary) => {
    // No delete: a strand cannot be deleted, only left.
    Alert.alert(s.title, undefined, [
      { text: t('actions.mute', 'Mute'), onPress: () => navigation.navigate('StrandDetail', { strandId: s.id, title: s.title }) },
      { text: s.archived ? t('actions.unarchive', 'Unarchive') : t('actions.archive', 'Archive') },
      { text: t('actions.leave', 'Leave…'), style: 'destructive', onPress: () => navigation.navigate('StrandDetail', { strandId: s.id, title: s.title }) },
      { text: t('common.cancel', 'Cancel'), style: 'cancel' },
    ]);
  };

  const isEmpty = strands.length === 0 && invites.length === 0;
  const nothingNew = !isEmpty && strands.every(s => !s.unreadCount && !s.mentioned);

  const sortIcon = sortMode === 'recent' ? 'time-outline' : sortMode === 'alpha' ? 'text-outline' : 'mail-unread-outline';

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.controls}>
        <IconButton name="search-outline" size={20} variant="bordered" style={styles.flex1}
          accessibilityLabel={t('actions.search', 'Search')} onPress={() => navigation.navigate('SearchInterface')} />
        <IconButton name="add-outline" size={20} variant="accent" style={styles.flex2}
          accessibilityLabel={t('actions.newStrand', 'New strand')} onPress={() => navigation.navigate('InvitationGenerator')} />
        <IconButton name={sortIcon} size={20} variant="bordered" style={styles.flex1}
          accessibilityLabel={t('actions.sort', 'Sort')}
          onPress={() => setSortMode(p => (p === 'recent' ? 'alpha' : p === 'alpha' ? 'unread' : 'recent'))} />
      </View>

      <View style={styles.flex1}>
      {error ? (
        <Banner message={error} action={{ label: t('common.retry', 'Retry'), onPress: load }} />
      ) : isEmpty ? (
        // First run.  This is where the word "strand" is introduced, attached to
        // something the user is looking at (story 01).  Not an error, and it
        // does not nag on return visits.
        <EmptyState
          testID="empty-state"
          hintTestID="empty-state-text"
          icon="chatbubbles-outline"
          title={t('screens.strands.emptyTitle', 'No strands yet')}
          hint={t('screens.strands.empty',
            'A strand is a conversation you and somebody else agree to. Until you have one, nobody can reach you — and you can reach nobody.')}
          cta={{ label: t('screens.strands.emptyCta', 'Start a strand'), onPress: () => navigation.navigate('InvitationGenerator') }}
        />
      ) : (
        <SectionList
          testID="strand-list"
          sections={sections as any}
          keyExtractor={(item: any) => item.id}
          contentContainerStyle={styles.list}
          stickySectionHeadersEnabled={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.textSecondary} />}
          renderSectionHeader={({ section }: any) =>
            section.title ? <SectionHeader label={section.title} /> : null
          }
          ListFooterComponent={
            nothingNew ? (
              <View style={styles.nothingNew}>
                <Banner variant="info" message={t('screens.strands.nothingNew', 'Nothing new.')} />
              </View>
            ) : null
          }
          renderItem={({ item, section }: any) => {
            if (section.title === t('screens.strands.pending', 'Pending')) {
              const inv = item as Invitation;
              return (
                <ListRow
                  testID={`invite-${inv.id}`}
                  title={inv.label ?? t('screens.strands.invitation', 'Invitation')}
                  subtitle={inv.direction === 'incoming'
                    ? t('screens.strands.awaitingYou', 'Waiting for your answer')
                    : t('screens.strands.awaitingThem', 'Sent — not taken up yet')}
                  leading={<Avatar name="?" size="sm" />}
                  onPress={() => navigation.navigate(
                    inv.direction === 'incoming' ? 'InvitationAcceptance' : 'InvitationGenerator',
                    { token: inv.token },
                  )}
                />
              );
            }
            const s = item as StrandSummary;
            const preview = s.draftPreview
              ? `${t('screens.strands.draft', 'Draft')}: ${s.draftPreview}`
              : s.lastMessage
                ? s.lastMessage.senderName
                  ? `${s.lastMessage.senderName}: ${s.lastMessage.previewText}`
                  : s.lastMessage.previewText
                : t('screens.strands.noMessages', 'No messages yet');
            return (
              <ListRow
                testID={`strand-${s.id}`}
                title={s.title}
                subtitle={preview}
                leading={<Avatar name={s.title} uri={s.avatarUri} size="sm" />}
                trailing={indicatorFor(s)}
                onPress={() => navigation.navigate('ChatInterface', { strandId: s.id, title: s.title, avatarUri: s.avatarUri })}
                onLongPress={() => rowActions(s)}
              />
            );
          }}
        />
      )}
      </View>

      <View style={[styles.footer, { backgroundColor: theme.surface, borderTopColor: theme.divider }]}>
        <IconButton name="qr-code-outline" size={22} style={styles.flex1}
          accessibilityLabel={t('actions.scan', 'Scan')} onPress={() => navigation.navigate('QrScanner')} />
        <IconButton name="person-circle-outline" size={22} style={styles.flex1}
          accessibilityLabel={t('actions.profile', 'Profile')} onPress={() => navigation.navigate('Profile')} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], paddingHorizontal: spacing[3], paddingVertical: spacing[1] },
  flex1: { flex: 1 },
  flex2: { flex: 2 },
  list: { paddingHorizontal: spacing[3], paddingTop: spacing[1], paddingBottom: spacing[2] },
  nothingNew: { paddingTop: spacing[2] },
  footer: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing[3], paddingVertical: spacing[1], borderTopWidth: StyleSheet.hairlineWidth },
});
