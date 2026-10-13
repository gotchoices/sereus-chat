/**
 * StrandList — home.  Every strand the user belongs to.
 * Spec: design/specs/mobile/screens/strand-list.md
 * Consolidation: design/generated/mobile/screens/StrandList.md
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, SectionList, StyleSheet, RefreshControl, Alert, Pressable, ActivityIndicator } from 'react-native';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { matchesStrand, sortStrands, strandListStore, type StrandSort, type StrandSummary } from '@chat/core';
import { useModel, useStore } from '../data/bind';
import { useErrorText, useT } from '../i18n';
import { useDataRevision } from '../mock/VariantContext';
import { ActionSheet, Avatar, ListRow, Badge, EmptyState, Banner, IconButton, SectionHeader } from '../components';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useTheme, typography, spacing, radius } from '../theme';

type SortMode = StrandSort;

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
  const errorText = useErrorText();
  const rev = useDataRevision();
  const theme = useTheme();
  /**
   * The list, its invitation counts, member names and start-up state, from the core's
   * strand-list store. Bound only while this screen is focused, so a list hidden under
   * an open chat does no work. The store re-reads when a strand changes, and polls only
   * as a backstop (see `strandListStore`).
   */
  const model = useModel();
  const store = useMemo(() => strandListStore(model), [model]);
  const view = useStore(store, useIsFocused());
  useEffect(() => { if (rev) store.reload(); }, [rev, store]);
  /**
   * Has the first read finished? Until it has, an empty list means "not asked
   * yet", not "nothing here" — and those must not look the same. Story 01's
   * introduction to strands, shown to someone who HAS strands, reads as data loss.
   */
  const loaded = view.state !== 'loading';
  const strands = useMemo(() => view.value?.strands ?? [], [view.value]);
  const memberNames = useMemo(() => view.value?.memberNames ?? {}, [view.value]);
  /** True while the node is still opening strands. */
  const settling = view.value?.settling ?? view.state === 'loading';
  /** Why start-up failed — a failed boot must not render as an endless spinner. */
  const bootError = view.value?.bootError ?? null;
  const [actionError, setActionError] = useState<string | null>(null);
  const error = actionError ?? view.error?.message ?? null;
  const [refreshing, setRefreshing] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('recent');
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const load = useCallback(() => { setActionError(null); store.reload(); }, [store]);

  // Narrowing is free: a string match over names already held.  No read, no
  // network, works with nothing reachable (story 32).
  const matches = useCallback((s: StrandSummary) => matchesStrand(s, query, memberNames), [query, memberNames]);

  const sections = useMemo(() => {
    const active = strands.filter(s => !s.archived && !s.pending && matches(s));
    const archived = strands.filter(s => s.archived && matches(s));

    // The order is the core's policy (`sortStrands`): mutes and mentions included.
    const sorted = sortStrands(active, sortMode);

    const out: Array<{ title: string | null; data: any[] }> = [];
    // ONE ROW PER STRAND (human spec): there is no Pending section. An outstanding
    // invitation is part of the strand it leads into — counted on that strand's
    // row below — never a row of its own.
    out.push({ title: null, data: sorted });
    // "Hidden", matching the act that put them here. The data field is still
    // `archived` (that is `ops.md`'s name for it), but the word the user sees is
    // the one on the button they pressed — story 33 calls this hiding.
    if (archived.length) out.push({ title: t('strands.hidden'), data: archived });
    return out;
  }, [strands, sortMode, matches, t]);

  /**
   * The user's own outstanding invitations, counted per strand. Only their own:
   * an invitation is known only to the party that made it (story 31 1a), so the
   * count claims nothing about anyone else's. One whose strand is not listed yet
   * is simply not counted until it is — it never becomes a row.
   */
  const invitesOut = view.value?.invitationsOut ?? {};
  const invitesOutText = (n: number) =>
    n === 0 ? t('strands.noInvitationOut')
    : n === 1 ? t('strands.oneInvitationOut')
    : t('strands.invitationsOut').replace('{{n}}', String(n));

  const onRefresh = async () => { setRefreshing(true); setActionError(null); await store.refresh(); setRefreshing(false); };

  /**
   * Long-press menu. An ActionSheet, not `Alert.alert`: Android dialogs hold three
   * buttons and this needs four, so the fourth — Cancel — was being dropped and
   * the menu had no way out of it.
   *
   * The quick actions are the reversible ones, which is what a shortcut should
   * carry. Mute and Hide take effect here and can be undone here. Leaving and
   * forgetting are neither quick nor reversible, and story 33 says each is offered
   * with its cost stated first, so they stay on the strand's own screen — reached
   * through "Open…" below rather than fired from a press-and-hold.
   */
  const [rowMenu, setRowMenu] = useState<StrandSummary | null>(null);
  const rowActions = (s: StrandSummary) => setRowMenu(s);

  const applyMute = async (s: StrandSummary) => {
    const next = s.muted === 'none' ? 'soft' : s.muted === 'soft' ? 'hard' : 'none';
    const done = await model.strands.setMuted(s.id, next);
    if (done.ok) store.reload(); else setActionError(errorText(done.error));
  };

  const applyHide = async (s: StrandSummary) => {
    const done = await model.strands.setArchived(s.id, !s.archived);
    if (done.ok) store.reload(); else setActionError(errorText(done.error));
  };

  const isEmpty = strands.length === 0;
  const nothingNew = !isEmpty && strands.every(s => !s.unreadCount && !s.mentioned);

  const sortIcon = sortMode === 'recent' ? 'time-outline' : sortMode === 'alpha' ? 'text-outline' : 'mail-unread-outline';

  // Three choices plus Cancel is four, one more than an Android dialog holds.
  const [sortMenu, setSortMenu] = useState(false);
  const chooseSort = () => setSortMenu(true);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.controls}>
        <IconButton name="search-outline" size={20} variant="bordered" style={styles.flex1}
          accessibilityLabel={t('actions.search')}
          onPress={() => setSearching(v => { if (v) setQuery(''); return !v; })} />
        <IconButton name="add-outline" size={20} variant="accent" style={styles.flex2}
          accessibilityLabel={t('actions.newStrand')} onPress={() => navigation.navigate('InvitationGenerator')} />
        <IconButton name={sortIcon} size={20} variant="bordered" style={styles.flex1}
          accessibilityLabel={t('actions.sort')} onPress={chooseSort} />
      </View>

      {searching ? (
        <TextInput
          testID="strand-filter"
          value={query}
          onChangeText={setQuery}
          autoFocus
          placeholder={t('strands.filter')}
          placeholderTextColor={theme.textMuted}
          style={[typography.body, styles.filter, { color: theme.textPrimary, backgroundColor: theme.surfaceAlt }]}
        />
      ) : null}

      <View style={styles.flex1}>
      {error ? (
        <Banner message={error} action={{ label: t('common.retry'), onPress: load }} />
      ) : bootError ? (
        // A FAILED start, not a slow one. Before this branch existed both looked
        // like the spinner below, so "the app is broken" and "the app is working
        // on it" were the same screen — and the only report of the difference
        // went to a console no phone user can read.
        <Banner
          // `t` takes a key and a default, with no interpolation, so the reason
          // is appended rather than substituted.
          message={`${t('strands.bootFailed')}: ${bootError}`}
          action={{
            label: t('common.retry'),
            onPress: () => {
              void (async () => {
                await model.strands.retryBoot(); // a failure shows in the next read
                store.reload();
              })();
            },
          }}
        />
      ) : (!loaded || (settling && isEmpty)) ? (
        // Waiting, not empty. A spinner says "still looking"; the empty state
        // would say "there is nothing", which we do not yet know. Once there are
        // rows (even "Connecting…" ones from the cache) they show, settled or not.
        <View style={styles.loading}>
          <ActivityIndicator />
          <Text style={[typography.small, { color: theme.textMuted }]}>
            {t('strands.loading')}
          </Text>
        </View>
      ) : isEmpty ? (
        // First run.  This is where the word "strand" is introduced, attached to
        // something the user is looking at (story 01).  Not an error, and it
        // does not nag on return visits.
        <EmptyState
          testID="empty-state"
          hintTestID="empty-state-text"
          icon="chatbubbles-outline"
          title={t('strands.emptyTitle')}
          hint={t('strands.empty')}
          cta={{ label: t('strands.emptyCta'), onPress: () => navigation.navigate('InvitationGenerator') }}
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
            query.trim() ? (
              // The only way into message search from here, and always an
              // explicit tap: the sweep wakes hibernating strands.
              <Pressable
                testID="escalate-search"
                onPress={() => navigation.navigate('SearchInterface', { initialQuery: query.trim() })}
                style={[styles.escalate, { borderColor: theme.border, backgroundColor: theme.surfaceAlt }]}
              >
                <Text style={[typography.body, { color: theme.accent }]}>
                  {t('strands.searchMessages')
                    .replace('{{q}}', query.trim())}
                </Text>
                <Text style={[typography.small, { color: theme.textMuted }]}>
                  {t('strands.searchCost')}
                </Text>
              </Pressable>
            ) : nothingNew ? (
              <View style={styles.nothingNew}>
                <Banner variant="info" message={t('strands.nothingNew')} />
              </View>
            ) : null
          }
          renderItem={({ item }: any) => {
            const s = item as StrandSummary;
            // A strand nobody else has joined yet (story 30 F): it reads as waiting,
            // with its invitations as the second line, not as a conversation under an
            // invented name. Its title already says so (the adapter's placeholder).
            const awaiting = s.memberCount <= 1;
            const out = invitesOut[s.id] ?? 0;
            const preview = s.draftPreview
              ? `${t('strands.draft')}: ${s.draftPreview}`
              : s.lastMessage
                ? s.lastMessage.senderName
                  ? `${s.lastMessage.senderName}: ${s.lastMessage.previewText}`
                  : s.lastMessage.previewText
                : t('strands.noMessages');
            const connecting = t('strands.connecting');
            const subtitle = s.opening
              // Known from the last list, not open yet: say so instead of guessing.
              ? (s.lastMessage ? `${connecting} · ${preview}` : connecting)
              : awaiting
              ? (s.lastMessage || s.draftPreview ? `${preview} · ${invitesOutText(out)}` : invitesOutText(out))
              : out > 0 ? `${preview} · ${invitesOutText(out)}` : preview;
            return (
              <ListRow
                testID={`strand-${s.id}`}
                title={s.title}
                subtitle={subtitle}
                leading={awaiting
                  // A neutral glyph, not an avatar letter: a letter drawn from a
                  // sentence would read as a person.
                  ? <View style={[styles.waiting, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                      <Ionicons name="hourglass-outline" size={18} color={theme.textMuted} />
                    </View>
                  : <Avatar name={s.title} uri={s.avatarUri} size="sm" />}
                trailing={indicatorFor(s)}
                onPress={() => navigation.navigate('ChatInterface', {
                  strandId: s.id, title: s.title, avatarUri: s.avatarUri,
                  memberCount: s.memberCount, isGroup: s.isGroup,
                })}
                onLongPress={() => rowActions(s)}
              />
            );
          }}
        />
      )}
      </View>

      <ActionSheet
        visible={sortMenu}
        title={t('strands.sortTitle')}
        cancelLabel={t('common.cancel')}
        onDismiss={() => setSortMenu(false)}
        options={[
          { label: t('strands.sortRecent'), onPress: () => setSortMode('recent') },
          { label: t('strands.sortAlpha'), onPress: () => setSortMode('alpha') },
          { label: t('strands.sortUnread'), onPress: () => setSortMode('unread') },
        ]}
      />

      <ActionSheet
        visible={rowMenu !== null}
        title={rowMenu?.title}
        cancelLabel={t('common.cancel')}
        onDismiss={() => setRowMenu(null)}
        options={rowMenu ? [
          {
            label: rowMenu.muted === 'none' ? t('actions.mute')
              : rowMenu.muted === 'soft' ? t('strands.muteHard')
              : t('strands.unmute'),
            hint: rowMenu.muted === 'none' ? t('strands.muteHint')
              : rowMenu.muted === 'soft' ? t('strands.muteSoftNow')
              : t('strands.muteHardNow'),
            onPress: () => { void applyMute(rowMenu); },
          },
          {
            label: rowMenu.archived ? t('actions.unhide') : t('actions.hide'),
            hint: t('strands.hideHint'),
            onPress: () => { void applyHide(rowMenu); },
          },
          {
            label: t('strands.openDetails'),
            hint: t('strands.openDetailsHint'),
            onPress: () => navigation.navigate('StrandDetail', { strandId: rowMenu.id, title: rowMenu.title }),
          },
        ] : []}
      />

      <View style={[styles.footer, { backgroundColor: theme.surface, borderTopColor: theme.divider }]}>
        <IconButton name="qr-code-outline" size={22} style={styles.flex1}
          accessibilityLabel={t('actions.scan')} onPress={() => navigation.navigate('QrScanner')} />
        <IconButton name="person-circle-outline" size={22} style={styles.flex1}
          accessibilityLabel={t('actions.profile')} onPress={() => navigation.navigate('Profile')} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], paddingHorizontal: spacing[3], paddingVertical: spacing[1] },
  flex1: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing[2] },
  flex2: { flex: 2 },
  list: { paddingHorizontal: spacing[3], paddingTop: spacing[1], paddingBottom: spacing[2] },
  nothingNew: { paddingTop: spacing[2] },
  waiting: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
             borderWidth: StyleSheet.hairlineWidth },
  filter: { marginHorizontal: spacing[3], marginBottom: spacing[1], borderRadius: radius.control,
            paddingHorizontal: spacing[2], paddingVertical: spacing[2] },
  escalate: { marginTop: spacing[2], padding: spacing[2], borderRadius: radius.card,
              borderWidth: StyleSheet.hairlineWidth, gap: 2 },
  footer: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing[3], paddingVertical: spacing[1], borderTopWidth: StyleSheet.hairlineWidth },
});
