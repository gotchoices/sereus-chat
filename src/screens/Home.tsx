import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { listThreads, type ThreadSummary } from '../data/threads';

type Variant = 'happy' | 'empty' | 'error';

export default function Home() {
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [sortMode, setSortMode] = useState<'recent' | 'alpha' | 'unread'>('recent');

  const variant: Variant = 'happy';

  const applySort = (items: ThreadSummary[]) => {
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

  useEffect(() => {
    (async () => {
      try {
        const data = await listThreads(variant);
        setThreads(applySort(data));
      } catch (e: any) {
        setError(e?.message || 'Failed to load threads');
      }
    })();
  }, [sortMode]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      const data = await listThreads(variant);
      setThreads(applySort(data));
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'Failed to load threads');
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Sereus Chat</Text>
      </View>
      <View style={styles.controls}>
        <View style={styles.row}>
          <TouchableOpacity style={[styles.button, styles.flex1]}>
            <Ionicons name="search-outline" size={20} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.button, styles.flex2]}>
            <Ionicons name="person-add-outline" size={20} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.button, styles.flex1]}
            onPress={() => {
              setSortMode(prev => (prev === 'recent' ? 'alpha' : prev === 'alpha' ? 'unread' : 'recent'));
            }}
          >
            <Ionicons name={sortMode === 'recent' ? 'time-outline' : sortMode === 'alpha' ? 'text-outline' : 'mail-unread-outline'} size={20} />
          </TouchableOpacity>
        </View>
      </View>
      {error ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>{error}</Text>
        </View>
      ) : threads.length === 0 ? (
        <View style={styles.empty}>
          <Text>No threads yet. Invite a friend to start a thread.</Text>
        </View>
      ) : (
        <FlatList
          contentContainerStyle={styles.list}
          data={threads}
          keyExtractor={item => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          renderItem={({ item }) => (
            <View style={styles.item}>
              <View style={styles.itemLeft}>
                <View style={styles.avatar}>
                  <Text>{(item.displayName[0] || '?').toUpperCase()}</Text>
                </View>
              </View>
              <View style={styles.itemCenter}>
                <Text style={styles.name}>{item.displayName}</Text>
                <Text numberOfLines={1} style={styles.preview}>
                  {item.lastMessage?.previewText || ''}
                </Text>
              </View>
              <View style={styles.itemRight}>
                {!!item.unreadCount && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{Math.min(item.unreadCount, 99)}</Text>
                  </View>
                )}
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { paddingTop: 48, paddingHorizontal: 20 },
  title: { fontSize: 20, fontWeight: '600' },
  controls: { paddingHorizontal: 20, paddingVertical: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  button: { borderWidth: 1, borderColor: '#ddd', borderRadius: 6, paddingVertical: 6, alignItems: 'center' },
  flex1: { flex: 1 },
  flex2: { flex: 2 },
  banner: { backgroundColor: '#fee', padding: 12, marginHorizontal: 20, borderRadius: 6 },
  bannerText: { color: '#900' },
  empty: { padding: 20 },
  list: { paddingHorizontal: 0, paddingTop: 8 },
  item: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#eee' },
  itemLeft: { width: 44, alignItems: 'center' },
  avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#f0f0f0', alignItems: 'center', justifyContent: 'center' },
  itemCenter: { flex: 1, paddingHorizontal: 8 },
  name: { fontSize: 16, fontWeight: '500' },
  preview: { color: '#555', marginTop: 2 },
  itemRight: { width: 40, alignItems: 'flex-end' },
  badge: { backgroundColor: '#e33', borderRadius: 10, minWidth: 20, paddingHorizontal: 6, paddingVertical: 2, alignItems: 'center' },
  badgeText: { color: 'white', fontSize: 12 },
});


