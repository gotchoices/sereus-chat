import React, { useEffect, useState } from 'react';
import { View, StyleSheet, TextInput, FlatList } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { searchStrands } from '../data/adapter';
import type { StrandSummary } from '../data/types';
import { useT } from '../i18n';
import { Avatar, ListRow, EmptyState } from '../components';
import { useTheme, typography, spacing, radius } from '../theme';

export default function SearchInterface() {
  const navigation: any = useNavigation();
  const t = useT();
  const theme = useTheme();
  const [query, setQuery] = useState<string>('');
  const [results, setResults] = useState<StrandSummary[]>([]);

  useEffect(() => {
    const timeout = setTimeout(async () => {
      const data = await searchStrands(query);
      setResults(data);
    }, 300); // debounce
    return () => clearTimeout(timeout);
  }, [query]);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <TextInput
        style={[styles.input, { backgroundColor: theme.surfaceAlt, borderColor: theme.border, color: theme.textPrimary }]}
        placeholder={t('screens.search.placeholder', 'Search people and messages')}
        placeholderTextColor={theme.textMuted}
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
        autoCorrect={false}
        testID="search-input"
      />
      <FlatList
        keyboardShouldPersistTaps="handled"
        data={results}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <ListRow
            testID={`search-result-${item.id}`}
            title={item.displayName}
            subtitle={item.lastMessage?.previewText || ''}
            leading={<Avatar name={item.displayName} uri={item.avatarUrl} size="sm" />}
            onPress={() => navigation.navigate('ChatInterface', { strandId: item.id, name: item.displayName })}
          />
        )}
        ListEmptyComponent={
          <EmptyState
            icon="search-outline"
            title={query ? t('screens.search.noResults', 'No results') : t('screens.search.startTitle', 'Search your strands')}
            hint={query ? t('screens.search.noResultsHint', 'Try a different name or message.') : t('screens.search.startHint', 'Find people and messages across your strands.')}
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  input: {
    margin: spacing[3],
    borderWidth: 1,
    borderRadius: radius.control,
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[2],
    ...typography.body,
  },
  list: { paddingHorizontal: spacing[3], paddingBottom: spacing[3], flexGrow: 1 },
});
