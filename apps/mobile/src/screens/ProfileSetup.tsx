import React, { useEffect, useLayoutEffect, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { getProfile, saveProfile } from '../data/adapter';
import type { Profile } from '../data/types';
import { useT } from '../i18n';
import { Avatar, ListRow } from '../components';
import { useTheme, typography, spacing, radius, HIT_SLOP } from '../theme';

export default function ProfileSetup() {
  const navigation: any = useNavigation();
  const t = useT();
  const theme = useTheme();
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
      setError(t('screens.ProfileSetup.nameRequired', 'Name is required'));
      return;
    }
    await saveProfile({ name: name.trim(), email, phone, notes });
    navigation.goBack();
  };

  useLayoutEffect(() => {
    navigation.setOptions({
      title: t('screens.ProfileSetup.title', 'Profile'),
      headerRight: () => (
        <TouchableOpacity
          style={[styles.saveBtn, { backgroundColor: theme.accent }]}
          onPress={onSave}
          hitSlop={HIT_SLOP}
          accessibilityLabel={t('screens.ProfileSetup.saveA11y', 'Save profile')}
          testID="profile-save"
        >
          <Text style={[styles.saveBtnText, { color: theme.accentText }]}>
            {t('screens.ProfileSetup.save', 'Save')}
          </Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation, theme, t, name, email, phone, notes]);

  const onEditAvatar = () => {
    navigation.navigate('MediaPicker');
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.avatarWrap}>
        <Avatar name={name} uri={null} size="lg" />
        <TouchableOpacity
          style={[styles.pencil, { backgroundColor: theme.surface, borderColor: theme.border }]}
          onPress={onEditAvatar}
          hitSlop={HIT_SLOP}
          accessibilityLabel={t('screens.ProfileSetup.editAvatar', 'Edit avatar')}
          testID="profile-edit-avatar"
        >
          <Ionicons name="pencil" size={16} color={theme.textPrimary} />
        </TouchableOpacity>
      </View>

      <View style={[styles.card, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}>
        <View style={styles.field}>
          <Text style={[styles.label, { color: theme.textSecondary }]}>
            {t('screens.ProfileSetup.nameLabel', 'Name')}
            <Text style={{ color: theme.danger }}>*</Text>
          </Text>
          <TextInput
            style={[
              styles.input,
              { backgroundColor: theme.surface, borderColor: error ? theme.danger : theme.border, color: theme.textPrimary },
            ]}
            placeholder={t('screens.ProfileSetup.namePlaceholder', 'Your name')}
            placeholderTextColor={theme.textMuted}
            value={name}
            onChangeText={(text) => { setName(text); setError(null); }}
            accessibilityLabel={t('screens.ProfileSetup.nameLabel', 'Name')}
            testID="profile-name"
          />
          {!!error && <Text style={[styles.errorText, { color: theme.danger }]}>{error}</Text>}
        </View>

        <View style={styles.field}>
          <Text style={[styles.label, { color: theme.textSecondary }]}>
            {t('screens.ProfileSetup.emailLabel', 'Email')}
          </Text>
          <TextInput
            style={[styles.input, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.textPrimary }]}
            placeholder={t('screens.ProfileSetup.emailPlaceholder', 'you@example.com')}
            placeholderTextColor={theme.textMuted}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            accessibilityLabel={t('screens.ProfileSetup.emailLabel', 'Email')}
            testID="profile-email"
          />
        </View>

        <View style={styles.field}>
          <Text style={[styles.label, { color: theme.textSecondary }]}>
            {t('screens.ProfileSetup.phoneLabel', 'Phone')}
          </Text>
          <TextInput
            style={[styles.input, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.textPrimary }]}
            placeholder={t('screens.ProfileSetup.phonePlaceholder', '+1 555 123 4567')}
            placeholderTextColor={theme.textMuted}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            accessibilityLabel={t('screens.ProfileSetup.phoneLabel', 'Phone')}
            testID="profile-phone"
          />
        </View>

        <View style={styles.fieldLast}>
          <Text style={[styles.label, { color: theme.textSecondary }]}>
            {t('screens.ProfileSetup.notesLabel', 'Notes/Bio')}
          </Text>
          <TextInput
            style={[
              styles.input,
              styles.inputMultiline,
              { backgroundColor: theme.surface, borderColor: theme.border, color: theme.textPrimary },
            ]}
            placeholder={t('screens.ProfileSetup.notesPlaceholder', 'A few words about you')}
            placeholderTextColor={theme.textMuted}
            value={notes}
            onChangeText={setNotes}
            multiline
            accessibilityLabel={t('screens.ProfileSetup.notesLabel', 'Notes')}
            testID="profile-notes"
          />
        </View>
      </View>

      <ListRow
        testID="profile-manage-devices"
        title={t('screens.ProfileSetup.manageDevices', 'Manage devices')}
        subtitle={t('screens.ProfileSetup.manageDevicesHint', 'Add a drone, server, or another device to your cadre')}
        leading={<Ionicons name="hardware-chip-outline" size={22} color={theme.textPrimary} />}
        trailing={<Ionicons name="chevron-forward" size={20} color={theme.textMuted} />}
        onPress={() => navigation.navigate('CadreManager')}
      />

      <Text style={[styles.noticeText, { color: theme.textMuted }]}>
        {t(
          'screens.ProfileSetup.notice',
          'Personal information is not collected or stored by Sereus. But information you enter may be shared with connected peers.',
        )}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: spacing[4] },
  avatarWrap: { alignItems: 'center', marginBottom: spacing[3] },
  pencil: {
    position: 'absolute',
    right: '32%',
    bottom: 0,
    borderWidth: 1,
    borderRadius: radius.pill,
    padding: spacing[1],
  },
  card: {
    borderWidth: 1,
    borderRadius: radius.card,
    padding: spacing[3],
    marginBottom: spacing[3],
  },
  field: { marginBottom: spacing[2] },
  fieldLast: {},
  label: { ...typography.small, marginBottom: spacing[0] },
  input: {
    borderWidth: 1,
    borderRadius: radius.control,
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[2],
    ...typography.body,
  },
  inputMultiline: { height: 92, textAlignVertical: 'top' },
  errorText: { ...typography.small, marginTop: spacing[0] },
  saveBtn: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    borderRadius: radius.control,
    marginRight: spacing[2],
  },
  saveBtnText: { ...typography.body, fontWeight: '600' },
  noticeText: { ...typography.small },
});
