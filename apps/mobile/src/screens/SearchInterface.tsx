/**
 * SearchInterface — progressive search across strands or within one.
 * Spec: design/specs/mobile/screens/search-interface.md
 *
 * Search is complete but not quick.  There is no cross-strand index and most
 * strands are not running until something wakes them, so results arrive in
 * batches and the screen must never present an unfinished sweep as a finished
 * answer.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, FlatList, StyleSheet } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { search } from '../data/adapter';
import type { SearchHit } from '../data/types';
import { useT } from '../i18n';
import { ListRow, EmptyState, Banner } from '../components';
import { useTheme, typography, spacing, radius } from '../theme';

export default function SearchInterface() {
  const navigation: any = useNavigation();
  const route: any = useRoute();
  const scopedStrandId: string | undefined = route?.params?.strandId;
  const t = useT();
  const theme = useTheme();

  const [query, setQuery] = useState<string>(route?.params?.initialQuery ?? '');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [progress, setProgress] = useState<{ searched: number; total: number; skipped: number } | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  const run = useCallback(async (q: string) => {
    abort.current?.abort();           // an abandoned sweep must stop waking strands
    if (!q.trim()) { setHits([]); setProgress(null); setRunning(false); return; }

    const ctrl = new AbortController();
    abort.current = ctrl;
    setHits([]); setProgress(null); setError(null); setRunning(true);
    try {
      for await (const batch of search(q, { strandId: scopedStrandId, signal: ctrl.signal })) {
        if (ctrl.signal.aborted) return;
        // Append only — never reorder what the reader is already looking at.
        setHits(prev => [...prev, ...batch.results]);
        setProgress({ searched: batch.strandsSearched, total: batch.strandsTotal, skipped: batch.strandsSkipped });
      }
    } catch (e: any) {
      setError(e?.message ?? 'Search could not run');
    } finally {
      if (!ctrl.signal.aborted) setRunning(false);
    }
  }, [scopedStrandId]);

  useEffect(() => {
    const id = setTimeout(() => void run(query), 300);
    return () => clearTimeout(id);
  }, [query, run]);

  useEffect(() => () => abort.current?.abort(), []);

  const done = !running && !!progress;
  const status = progress
    ? running
      ? t('screens.search.progress', 'Looked in {{a}} of {{b}} strands…')
          .replace('{{a}}', String(progress.searched)).replace('{{b}}', String(progress.total))
      : progress.skipped > 0
        ? t('screens.search.partial', '{{n}} strands could not be reached, so this is not everything.')
            .replace('{{n}}', String(progress.skipped))
        : null
    : null;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <TextInput
        testID="search-input"
        value={query}
        onChangeText={setQuery}
        autoFocus={!route?.params?.initialQuery}
        placeholder={scopedStrandId
          ? t('screens.search.inStrand', 'Search this conversation')
          : t('screens.search.everywhere', 'Search everything')}
        placeholderTextColor={theme.textMuted}
        style={[typography.body, styles.input, { color: theme.textPrimary, backgroundColor: theme.surfaceAlt }]}
      />

      {error ? <Banner message={error} action={{ label: t('common.retry', 'Retry'), onPress: () => run(query) }} /> : null}
      {status ? (
        <Text style={[typography.small, styles.status, { color: theme.textMuted }]}>{status}</Text>
      ) : null}

      {done && hits.length === 0 && query.trim() ? (
        <EmptyState icon="search-outline"
          title={t('screens.search.noneTitle', 'Nothing found')}
          hint={t('screens.search.none', 'No message matched that.')} />
      ) : (
        <FlatList
          testID="search-results"
          data={hits}
          keyExtractor={h => `${h.strandId}-${h.messageId}`}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <ListRow
              testID={`hit-${item.messageId}`}
              // In a cross-strand search the strand leads: a match means
              // nothing without knowing where it came from.
              title={scopedStrandId ? item.senderName : `${item.strandTitle} · ${item.senderName}`}
              subtitle={item.snippet}
              onPress={() => navigation.navigate('ChatInterface', {
                strandId: item.strandId,
                title: item.strandTitle,
                anchorMessageId: item.messageId,
              })}
            />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: spacing[3], gap: spacing[1] },
  input: { borderRadius: radius.control, paddingHorizontal: spacing[2], paddingVertical: spacing[2] },
  status: { paddingVertical: spacing[1] },
  list: { paddingTop: spacing[1], gap: spacing[1] },
});
