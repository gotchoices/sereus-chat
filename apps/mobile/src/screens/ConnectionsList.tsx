import React, { useEffect, useState } from 'react';
import { View, FlatList, StyleSheet, RefreshControl } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { listStrands } from '../data/adapter';
import type { StrandSummary } from '../data/types';
import { useT } from '../i18n';
import { Avatar, ListRow, Badge, EmptyState, Banner, IconButton } from '../components';
import { useTheme, spacing } from '../theme';

export default function ConnectionsList() {
  const navigation: any = useNavigation();
  const t = useT();
  const theme = useTheme();
  const [threads, setThreads] = useState<StrandSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [sortMode, setSortMode] = useState<'recent' | 'alpha' | 'unread'>('recent');

  const applySort = (items: StrandSummary[]) => {
    const copy = [...items];
    if (sortMode === 'recent') {
      copy.sort((a, b) => {
        const at = a.lastMessage?.timestamp ? Date.parse(a.lastMessage.timestamp) : 0;
        const bt = b.lastMessage?.timestamp ? Date.parse(b.lastMessage.timestamp) : 0;
        return bt - at;
      });
    } else if (sortMode === 'alpha') {
      copy.sort((a, b) => a.displayName.localeCompare(b.displayName));
    } else if (sortMode === 'unread') {
      copy.sort((a, b) => (b.unreadCount - a.unreadCount) || a.displayName.localeCompare(b.displayName));
    }
    return copy;
  };

  const loadData = async () => {
    try {
      const data = await listStrands();
      setThreads(applySort(data));
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'Failed to load strands');
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortMode]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const sortIcon = sortMode === 'recent' ? 'time-outline' : sortMode === 'alpha' ? 'text-outline' : 'mail-unread-outline';

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.controls}>
        <IconButton name="search-outline" size={20} variant="bordered" style={styles.flex1}
          accessibilityLabel="Search" onPress={() => navigation.navigate('SearchInterface')} />
        <IconButton name="person-add-outline" size={20} variant="accent" style={styles.flex2}
          accessibilityLabel="Add Friends" onPress={() => navigation.navigate('InvitationGenerator')} />
        <IconButton name={sortIcon} size={20} variant="bordered" style={styles.flex1}
          accessibilityLabel="Sort"
          onPress={() => setSortMode(prev => prev === 'recent' ? 'alpha' : prev === 'alpha' ? 'unread' : 'recent')} />
      </View>

      {error ? (
        <Banner message={error} action={{ label: t('common.retry', 'Retry'), onPress: loadData }} />
      ) : threads.length === 0 ? (
        <EmptyState
          testID="empty-state"
          hintTestID="empty-state-text"
          icon="chatbubbles-outline"
          title={t('screens.connections.emptyTitle', 'No strands yet')}
          hint={t('screens.connections.empty', 'Invite a friend to start a strand.')}
          cta={{ label: t('screens.connections.emptyCta', 'Invite a friend'), onPress: () => navigation.navigate('InvitationGenerator') }}
        />
      ) : (
        <FlatList
          contentContainerStyle={styles.list}
          data={threads}
          keyExtractor={(item) => item.id}
          testID="connections-list"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.textSecondary} />}
          renderItem={({ item }) => (
            <ListRow
              testID={`strand-${item.id}`}
              title={item.displayName}
              subtitle={item.lastMessage?.previewText || ''}
              leading={<Avatar name={item.displayName} uri={item.avatarUrl} size="sm" />}
              trailing={item.unreadCount ? <Badge mode="count" count={item.unreadCount} /> : undefined}
              onPress={() => navigation.navigate('ChatInterface', {
                strandId: item.id,
                name: item.displayName,
                avatarUrl: item.avatarUrl,
              })}
            />
          )}
        />
      )}

      <View style={[styles.footer, { backgroundColor: theme.surface, borderTopColor: theme.divider }]}>
        <IconButton name="qr-code-outline" size={22} style={styles.flex1} accessibilityLabel="Scan QR" onPress={() => navigation.navigate('QrScanner')} />
        <IconButton name="notifications-outline" size={22} style={styles.flex1} accessibilityLabel="Alerts" onPress={() => navigation.navigate('Alerts')} />
        <IconButton name="person-circle-outline" size={22} style={styles.flex1} accessibilityLabel="Profile" onPress={() => navigation.navigate('ProfileSetup')} />
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
  footer: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing[3], paddingVertical: spacing[1], borderTopWidth: StyleSheet.hairlineWidth },
});
