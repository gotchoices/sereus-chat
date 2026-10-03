/**
 * StrandList — home.  Every strand the user belongs to.
 * Spec: design/specs/mobile/screens/strand-list.md
 * Consolidation: design/generated/mobile/screens/StrandList.md
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, SectionList, StyleSheet, RefreshControl, Alert, Pressable, ActivityIndicator } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { listStrands, strandsSettling, strandsBootError, retryBoot, listOutstandingInvitations, listMembers, setStrandMuted, setStrandArchived } from '../data/adapter';
import type { StrandSummary, Invitation } from '../data/types';
import { useT } from '../i18n';
import { useDataRevision } from '../mock/VariantContext';
import { ActionSheet, Avatar, ListRow, Badge, EmptyState, Banner, IconButton, SectionHeader } from '../components';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useTheme, typography, spacing, radius } from '../theme';

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
  /**
   * Has the first read finished? Until it has, an empty list means "not asked
   * yet", not "nothing here" — and those must not look the same. Attaching
   * strands takes seconds on a phone, so the screen used to open on "No strands
   * yet. Until you have one, nobody can reach you" and then quietly fill in. That
   * sentence is story 01's introduction to the whole idea; showing it to someone
   * who HAS strands reads as data loss.
   */
  const [loaded, setLoaded] = useState(false);
  /** True while the node is still opening strands — see `strandsSettling`. */
  const [settling, setSettling] = useState(true);
  /**
   * Why start-up failed, if it did. Without this a failed boot renders as the
   * same endless spinner as a slow one, which is how a broken app looks exactly
   * like a patient one.
   */
  const [bootError, setBootError] = useState<string | null>(null);
  const [invites, setInvites] = useState<Invitation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('recent');
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  // Member names per strand, so narrowing can match "the group with Priya in it".
  // Loaded once with the list — never fetched on a keystroke.
  const [memberNames, setMemberNames] = useState<Record<string, string[]>>({});

  const load = useCallback(async () => {
    try {
      const [s, i] = await Promise.all([
        listStrands(),
        listOutstandingInvitations().catch(() => [] as Invitation[]),
      ]);
      setStrands(s);
      setInvites(i);
      setError(null);
      const names: Record<string, string[]> = {};
      await Promise.all(s.map(async st => {
        try { names[st.id] = (await listMembers(st.id)).map(m => m.name); } catch { names[st.id] = []; }
      }));
      setMemberNames(names);
    } catch (e: any) {
      setError(e?.message || 'Could not reach your strands right now');
    } finally {
      setLoaded(true);
    }
    // Asked AFTER the read, so the two agree: if a strand finished opening while
    // the read was in flight, the next poll picks it up rather than this one
    // declaring the list empty.
    try { setSettling(await strandsSettling()); } catch { setSettling(false); }
    try { setBootError(await strandsBootError()); } catch { /* leave as-is */ }
  }, []);

  /**
   * Re-read while the list is on screen. There is no event to wait on —
   * cadre-core emits strand lifecycle events, but the adapter boundary
   * deliberately does not expose them — so the list polls: every 3 s while the
   * node is still bringing strands up, then every 10 s.
   *
   * The slow poll is not optional. "Settled" means the boot sweep is done, not
   * that every strand is open: a strand joined from another party can be
   * offered by discovery AFTER the sweep (seen on sereus 1.8, where joined
   * strands are recorded party-wide), and with polling stopped it never
   * appeared — a phone that had just rejoined its conversation showed "No
   * strands yet", which reads as data loss. New messages' previews and a
   * partner's first Member row arriving are the same kind of change.
   */
  useFocusEffect(useCallback(() => {
    void load();
    const timer = setInterval(() => { void load(); }, settling ? 3000 : 10_000);
    return () => clearInterval(timer);
  }, [load, settling]));
  useEffect(() => { void load(); }, [load, rev]);

  // Narrowing is free: a string match over names already held.  No adapter
  // call, no network, works with nothing reachable (story 32).
  const matches = useCallback((s: StrandSummary) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    if (s.title.toLowerCase().includes(q)) return true;
    return (memberNames[s.id] ?? []).some(n => n.toLowerCase().includes(q));
  }, [query, memberNames]);

  const sections = useMemo(() => {
    const active = strands.filter(s => !s.archived && !s.pending && matches(s));
    const archived = strands.filter(s => s.archived && matches(s));

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
    // ONE ROW PER STRAND (human spec): there is no Pending section. An outstanding
    // invitation is part of the strand it leads into — counted on that strand's
    // row below — never a row of its own.
    out.push({ title: null, data: sorted });
    // "Hidden", matching the act that put them here. The data field is still
    // `archived` (that is `ops.md`'s name for it), but the word the user sees is
    // the one on the button they pressed — story 33 calls this hiding.
    if (archived.length) out.push({ title: t('screens.strands.hidden', 'Hidden'), data: archived });
    return out;
  }, [strands, sortMode, matches, t]);

  /**
   * The user's own outstanding invitations, counted per strand. Only their own:
   * an invitation is known only to the party that made it (story 31 1a), so the
   * count claims nothing about anyone else's. One whose strand is not listed yet
   * is simply not counted until it is — it never becomes a row.
   */
  const invitesOut = useMemo(() => {
    const out: Record<string, number> = {};
    for (const inv of invites) {
      if (inv.direction === 'incoming' || !inv.strandId) continue;
      out[inv.strandId] = (out[inv.strandId] ?? 0) + 1;
    }
    return out;
  }, [invites]);
  const invitesOutText = (n: number) =>
    n === 0 ? t('screens.strands.noInvitationOut', 'No invitation out')
    : n === 1 ? t('screens.strands.oneInvitationOut', '1 invitation out')
    : t('screens.strands.invitationsOut', '{{n}} invitations out').replace('{{n}}', String(n));

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

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
    try { await setStrandMuted(s.id, next); await load(); }
    catch (e: any) { setError(e?.message ?? 'That setting could not be saved'); }
  };

  const applyHide = async (s: StrandSummary) => {
    try { await setStrandArchived(s.id, !s.archived); await load(); }
    catch (e: any) { setError(e?.message ?? 'That setting could not be saved'); }
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
          accessibilityLabel={t('actions.search', 'Search')}
          onPress={() => setSearching(v => { if (v) setQuery(''); return !v; })} />
        <IconButton name="add-outline" size={20} variant="accent" style={styles.flex2}
          accessibilityLabel={t('actions.newStrand', 'New strand')} onPress={() => navigation.navigate('InvitationGenerator')} />
        <IconButton name={sortIcon} size={20} variant="bordered" style={styles.flex1}
          accessibilityLabel={t('actions.sort', 'Sort')} onPress={chooseSort} />
      </View>

      {searching ? (
        <TextInput
          testID="strand-filter"
          value={query}
          onChangeText={setQuery}
          autoFocus
          placeholder={t('screens.strands.filter', 'Find a conversation')}
          placeholderTextColor={theme.textMuted}
          style={[typography.body, styles.filter, { color: theme.textPrimary, backgroundColor: theme.surfaceAlt }]}
        />
      ) : null}

      <View style={styles.flex1}>
      {error ? (
        <Banner message={error} action={{ label: t('common.retry', 'Retry'), onPress: load }} />
      ) : bootError ? (
        // A FAILED start, not a slow one. Before this branch existed both looked
        // like the spinner below, so "the app is broken" and "the app is working
        // on it" were the same screen — and the only report of the difference
        // went to a console no phone user can read.
        <Banner
          // `t` takes a key and a default, with no interpolation, so the reason
          // is appended rather than substituted.
          message={`${t('screens.strands.bootFailed', 'Could not start')}: ${bootError}`}
          action={{
            label: t('common.retry', 'Retry'),
            onPress: () => {
              void (async () => {
                setBootError(null);
                setSettling(true);
                try { await retryBoot(); } catch { /* re-read reports it */ }
                await load();
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
            {t('screens.strands.loading', 'Looking for your strands…')}
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
            query.trim() ? (
              // The only way into message search from here, and always an
              // explicit tap: the sweep wakes hibernating strands.
              <Pressable
                testID="escalate-search"
                onPress={() => navigation.navigate('SearchInterface', { initialQuery: query.trim() })}
                style={[styles.escalate, { borderColor: theme.border, backgroundColor: theme.surfaceAlt }]}
              >
                <Text style={[typography.body, { color: theme.accent }]}>
                  {t('screens.strands.searchMessages', 'Search messages for “{{q}}”')
                    .replace('{{q}}', query.trim())}
                </Text>
                <Text style={[typography.small, { color: theme.textMuted }]}>
                  {t('screens.strands.searchCost', 'Looks inside every strand, and wakes the ones that are asleep')}
                </Text>
              </Pressable>
            ) : nothingNew ? (
              <View style={styles.nothingNew}>
                <Banner variant="info" message={t('screens.strands.nothingNew', 'Nothing new.')} />
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
              ? `${t('screens.strands.draft', 'Draft')}: ${s.draftPreview}`
              : s.lastMessage
                ? s.lastMessage.senderName
                  ? `${s.lastMessage.senderName}: ${s.lastMessage.previewText}`
                  : s.lastMessage.previewText
                : t('screens.strands.noMessages', 'No messages yet');
            const connecting = t('screens.strands.connecting', 'Connecting…');
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
        title={t('screens.strands.sortTitle', 'Order by')}
        cancelLabel={t('common.cancel', 'Cancel')}
        onDismiss={() => setSortMenu(false)}
        options={[
          { label: t('screens.strands.sortRecent', 'Recent'), onPress: () => setSortMode('recent') },
          { label: t('screens.strands.sortAlpha', 'Alphabetical'), onPress: () => setSortMode('alpha') },
          { label: t('screens.strands.sortUnread', 'Unread first'), onPress: () => setSortMode('unread') },
        ]}
      />

      <ActionSheet
        visible={rowMenu !== null}
        title={rowMenu?.title}
        cancelLabel={t('common.cancel', 'Cancel')}
        onDismiss={() => setRowMenu(null)}
        options={rowMenu ? [
          {
            label: rowMenu.muted === 'none' ? t('actions.mute', 'Mute')
              : rowMenu.muted === 'soft' ? t('screens.strands.muteHard', 'Silence completely')
              : t('screens.strands.unmute', 'Unmute'),
            hint: rowMenu.muted === 'none' ? t('screens.strands.muteHint', 'Stays in your list; you are just not told about it')
              : rowMenu.muted === 'soft' ? t('screens.strands.muteSoftNow', 'Currently quiet unless somebody names you')
              : t('screens.strands.muteHardNow', 'Currently silent whatever happens'),
            onPress: () => { void applyMute(rowMenu); },
          },
          {
            label: rowMenu.archived ? t('actions.unhide', 'Unhide') : t('actions.hide', 'Hide'),
            hint: t('screens.strands.hideHint', 'Out of your list until you look for it; nothing changes for anyone else'),
            onPress: () => { void applyHide(rowMenu); },
          },
          {
            label: t('screens.strands.openDetails', 'Open…'),
            hint: t('screens.strands.openDetailsHint', 'Members, what is shared, and leaving'),
            onPress: () => navigation.navigate('StrandDetail', { strandId: rowMenu.id, title: rowMenu.title }),
          },
        ] : []}
      />

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
