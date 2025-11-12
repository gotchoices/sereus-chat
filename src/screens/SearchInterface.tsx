import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function SearchInterface() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Search</Text>
      <Text>Stub screen</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 20 },
  title: { fontSize: 18, fontWeight: '600', marginBottom: 8 }
});


