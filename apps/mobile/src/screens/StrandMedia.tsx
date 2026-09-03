/**
 * StrandMedia — everything shared in one strand.
 * Spec: design/specs/mobile/screens/strand-media.md
 *
 * `locality` has three values and they must stay distinguishable: a null `uri`
 * never means the thing is absent (design/specs/domain/overview.md).
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, FlatList, Pressable, Image, StyleSheet } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { listAttachments } from '../data/adapter';
import type { Attachment } from '../data/types';
import { useT } from '../i18n';
import { Banner, EmptyState, ListRow } from '../components';
import { useTheme, typography, spacing, radius } from '../theme';

type Kind = 'all' | Attachment['type'];

const KIND_LABEL: Record<Kind, string> = {
  all: 'All', image: 'Photos', video: 'Videos', file: 'Files', voice: 'Voice',
};
const MB = 1024 * 1024;
const size = (b?: number | null) => (b ? (b >= 1024 * MB ? `${(b / (1024 * MB)).toFixed(1)} GB` : `${Math.round(b / MB)} MB`) : '');

export default function StrandMedia() {
  const navigation: any = useNavigation();
  const route: any = useRoute();
  const { strandId, title } = route.params ?? {};
  const t = useT();
  const theme = useTheme();

  const [items, setItems] = useState<Attachment[]>([]);
  const [kind, setKind] = useState<Kind>('all');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setItems(await listAttachments(strandId)); setError(null); }
    catch (e: any) { setError(e?.message ?? 'Could not list what was shared here'); }
  }, [strandId]);

  useEffect(() => { void load(); }, [load]);

  const shown = useMemo(() => (kind === 'all' ? items : items.filter(i => i.type === kind)), [items, kind]);
  const totalBytes = useMemo(() => items.reduce((n, i) => n + (i.byteSize ?? 0), 0), [items]);
  const isGrid = kind === 'all' || kind === 'image' || kind === 'video';

  const open = (a: Attachment) =>
    navigation.navigate('MediaViewer', { strandId, attachmentId: a.id, setFilter: kind, title });

  const tile = (a: Attachment) => {
    if (a.locality === 'local' && a.uri && (a.type === 'image' || a.type === 'video')) {
      return <Image source={{ uri: a.uri }} style={styles.thumb} />;
    }
    // Three distinct states, and a fourth case that is NOT a state: a local
    // file or voice note is simply here — it just has no thumbnail.  Labelling
    // it "not reachable" would tell the user something false.
    const label =
      a.locality === 'fetching' ? t('screens.media.fetching', 'Coming…')
        : a.locality === 'unreachable' ? t('screens.media.unreachable', 'Not reachable right now')
          : a.name ?? KIND_LABEL[a.type];
    return (
      <View style={[styles.thumb, styles.placeholder, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}>
        <Text style={[typography.small, { color: theme.textMuted }]} numberOfLines={3}>
          {label}
        </Text>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.filters}>
        {(['all', 'image', 'video', 'file', 'voice'] as Kind[]).map(k => (
          <Pressable key={k} onPress={() => setKind(k)}
            style={[styles.filter, { borderColor: kind === k ? theme.accent : theme.border }]}>
            <Text style={[typography.small, { color: kind === k ? theme.accent : theme.textMuted }]}>
              {t(`screens.media.kind.${k}`, KIND_LABEL[k])}
            </Text>
          </Pressable>
        ))}
      </View>

      {error ? (
        <Banner message={error} action={{ label: t('common.retry', 'Retry'), onPress: load }} />
      ) : shown.length === 0 ? (
        <EmptyState icon="images-outline"
          title={t('screens.media.emptyTitle', 'Nothing shared here yet')}
          hint={t('screens.media.empty', 'Photos, files and voice messages will collect here.')} />
      ) : (
        <FlatList
          key={isGrid ? 'grid' : 'list'}
          testID="strand-media"
          data={shown}
          numColumns={isGrid ? 3 : 1}
          keyExtractor={a => a.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) =>
            isGrid ? (
              <Pressable onPress={() => open(item)} style={styles.cell}>{tile(item)}</Pressable>
            ) : (
              // A filename in a square tile is unreadable — files and voice are rows.
              <ListRow
                title={item.name ?? item.type}
                subtitle={[size(item.byteSize), item.locality !== 'local'
                  ? (item.locality === 'fetching' ? t('screens.media.fetching', 'Coming…') : t('screens.media.unreachable', 'Not reachable right now'))
                  : null].filter(Boolean).join(' · ')}
                onPress={() => open(item)}
              />
            )
          }
        />
      )}

      <View style={[styles.footer, { borderTopColor: theme.divider, backgroundColor: theme.surface }]}>
        <Text style={[typography.small, { color: theme.textMuted }]}>
          {t('screens.media.usage', '{{n}} things · {{size}} on this phone')
            .replace('{{n}}', String(items.length)).replace('{{size}}', size(totalBytes) || '0 MB')}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  filters: { flexDirection: 'row', gap: spacing[1], padding: spacing[2], flexWrap: 'wrap' },
  filter: { paddingHorizontal: spacing[2], paddingVertical: 4, borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth },
  list: { padding: spacing[1], gap: spacing[1] },
  cell: { flex: 1 / 3, padding: 2 },
  thumb: { aspectRatio: 1, borderRadius: radius.control, width: '100%' },
  placeholder: { alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, padding: 4 },
  footer: { padding: spacing[2], borderTopWidth: StyleSheet.hairlineWidth, alignItems: 'center' },
});
