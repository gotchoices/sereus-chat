import React, { useEffect, useLayoutEffect, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { getProfile, saveProfile } from '../data/adapter';
import type { Profile } from '../data/types';

export default function ProfileSetup() {
  const navigation: any = useNavigation();
  const [name, setName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const p = await getProfile();
      if (p) {
        setName(p.name || '');
        setEmail(p.email || '');
        setPhone(p.phone || '');
        setNotes(p.notes || '');
      }
    })();
  }, []);

  const onSave = async () => {
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    await saveProfile({ name: name.trim(), email, phone, notes });
    navigation.goBack();
  };

  useLayoutEffect(() => {
    navigation.setOptions({
      title: 'Profile',
      headerRight: () => (
        <TouchableOpacity style={{ paddingHorizontal: 12, paddingVertical: 6 }} onPress={onSave} accessibilityLabel="Save profile" testID="profile-save">
          <Text style={{ color: '#0066cc', fontWeight: '600' }}>Save</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation, name, email, phone, notes]);

  const onEditAvatar = () => {
    navigation.navigate('MediaPicker');
  };

  const initials = name.trim() ? name.trim()[0].toUpperCase() : '?';

  return (
    <View style={styles.container}>
      <View style={styles.avatarWrap}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <TouchableOpacity style={styles.pencil} onPress={onEditAvatar} accessibilityLabel="Edit avatar" testID="profile-edit-avatar">
          <Ionicons name="pencil" size={16} />
        </TouchableOpacity>
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Name<Text style={{ color: '#d00' }}>*</Text></Text>
        <TextInput
          style={[styles.input, error ? styles.inputError : null]}
          placeholder="Your name"
          value={name}
          onChangeText={(t) => { setName(t); setError(null); }}
          accessibilityLabel="Name"
          testID="profile-name"
        />
        {!!error && <Text style={styles.errorText}>{error}</Text>}
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          placeholder="you@example.com"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          accessibilityLabel="Email"
          testID="profile-email"
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Phone</Text>
        <TextInput
          style={styles.input}
          placeholder="+1 555 123 4567"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          accessibilityLabel="Phone"
          testID="profile-phone"
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Notes/Bio</Text>
        <TextInput
          style={[styles.input, { height: 92 }]}
          placeholder="A few words about you"
          value={notes}
          onChangeText={setNotes}
          multiline
          accessibilityLabel="Notes"
          testID="profile-notes"
        />
      </View>

      <View style={styles.notice}>
        <Text style={styles.noticeText}>
          Personal information is not collected or stored by Sereus. But information you enter may be shared with connected peers.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 20 },
  avatarWrap: { alignItems: 'center', marginBottom: 16 },
  avatar: { width: 96, height: 96, borderRadius: 48, backgroundColor: '#f0f0f0', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 36, fontWeight: '700' },
  pencil: { position: 'absolute', right: '30%', bottom: 4, backgroundColor: '#fff', borderRadius: 12, padding: 6, elevation: 2 },
  field: { marginBottom: 12 },
  label: { fontSize: 14, color: '#333', marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 10, fontSize: 16, backgroundColor: '#fff' },
  inputError: { borderColor: '#d00' },
  errorText: { color: '#d00', marginTop: 6 },
  notice: { marginTop: 8 },
  noticeText: { color: '#555' },
});
