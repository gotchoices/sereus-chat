import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TextInput, FlatList, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { searchStrands } from '../data/adapter';
import type { StrandSummary } from '../data/types';

export default function SearchInterface() {
  const navigation: any = useNavigation();
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
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        placeholder="Search people and messages"
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
          <TouchableOpacity
            style={styles.row}
            onPress={() => navigation.navigate('ChatInterface', { strandId: item.id, name: item.displayName })}
            testID={`search-result-${item.id}`}
          >
            <View style={styles.avatar}><Text style={styles.avatarText}>{(item.displayName[0] || '?').toUpperCase()}</Text></View>
            <View style={styles.col}>
              <Text style={styles.name}>{item.displayName}</Text>
              {!!item.lastMessage?.previewText && (
                <Text style={styles.preview} numberOfLines={1}>{item.lastMessage.previewText}</Text>
              )}
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={{ padding: 20 }}>
            <Text>No results</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  input: {
    margin: 16,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  list: { paddingBottom: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: { fontWeight: '600' },
  col: { flex: 1 },
  name: { fontSize: 16, fontWeight: '500' },
  preview: { color: '#666', marginTop: 4 },
});
