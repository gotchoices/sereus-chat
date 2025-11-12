import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function ProfileSetup() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Profile</Text>
      <Text>Stub screen</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 20 },
  title: { fontSize: 18, fontWeight: '600', marginBottom: 8 }
});


