/**
 * Profile — what other people see of me, and the way through to Settings and
 * my machines.  Also serves the first-run name prompt.
 * Spec: design/specs/mobile/screens/profile.md
 */

import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, ScrollView, StyleSheet, Alert } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { getProfile, saveProfile } from '../data/adapter';
import type { Profile as ProfileT } from '../data/types';
import { useT } from '../i18n';
import { Avatar, Banner, IconButton, ListRow, SectionHeader } from '../components';
import { useTheme, typography, spacing, radius } from '../theme';

export default function Profile() {
  const navigation: any = useNavigation();
  const route: any = useRoute();
  const firstRun: boolean = route?.params?.firstRun ?? false;
  const t = useT();
  const theme = useTheme();

  const [profile, setProfile] = useState<ProfileT>({ name: '', avatarUri: null });
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getProfile().then(setProfile).catch(e => setError(e?.message ?? 'Could not load your profile'));
  }, []);

  const update = (patch: Partial<ProfileT>) => { setProfile(p => ({ ...p, ...patch })); setDirty(true); };

  const save = async () => {
    if (!profile.name.trim()) {
      Alert.alert(t('screens.profile.nameRequired', 'A name is needed so people recognise you.'));
      return;
    }
    try {
      await saveProfile(profile);
      setDirty(false);
      if (firstRun) navigation.replace('StrandList');
      else navigation.goBack();
    } catch (e: any) {
      // Keep what they typed — never lose input on a failed save.
      setError(e?.message ?? 'Could not save your profile');
    }
  };

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.content}>
      {error ? <Banner message={error} action={{ label: t('common.retry', 'Retry'), onPress: save }} /> : null}

      <View style={styles.avatarBlock}>
        <Avatar name={profile.name || '?'} uri={profile.avatarUri} size="lg" />
        <IconButton
          name="camera-outline"
          size={20}
          variant="bordered"
          accessibilityLabel={t('screens.profile.changePhoto', 'Change photo')}
          onPress={() => navigation.navigate('MediaPicker', { purpose: 'avatar' })}
        />
        {profile.avatarUri ? (
          <IconButton
            name="trash-outline"
            size={20}
            variant="bordered"
            accessibilityLabel={t('screens.profile.removePhoto', 'Remove photo')}
            onPress={() => update({ avatarUri: null })}
          />
        ) : null}
      </View>

      <SectionHeader label={t('screens.profile.shared', 'What others see')} />
      <View style={[styles.field, { borderColor: theme.border, backgroundColor: theme.surfaceAlt }]}>
        <Text style={[typography.small, { color: theme.textMuted }]}>
          {t('screens.profile.nameLabel', 'Name')}
        </Text>
        <TextInput
          testID="profile-name"
          value={profile.name}
          onChangeText={v => update({ name: v })}
          placeholder={t('screens.profile.namePlaceholder', 'What your friends call you')}
          placeholderTextColor={theme.textMuted}
          style={[typography.body, { color: theme.textPrimary }]}
        />
      </View>
      <Text style={[typography.small, styles.note, { color: theme.textMuted }]}>
        {t('screens.profile.sharedNote',
          'Your name and picture go to the people in your strands. In a strand that can still grow, people you have not met may come to see them.')}
      </Text>

      {!firstRun ? (
        <>
          <SectionHeader label={t('screens.profile.private', 'Stays on this device')} />
          {([
            ['email', t('screens.profile.emailLabel', 'Email'), false],
            ['phone', t('screens.profile.phoneLabel', 'Phone'), false],
            ['notes', t('screens.profile.notesLabel', 'Notes / bio'), true],
          ] as Array<[keyof ProfileT, string, boolean]>).map(([key, label, multi]) => (
            <View key={key} style={[styles.field, { borderColor: theme.border, backgroundColor: theme.surfaceAlt }]}>
              <Text style={[typography.small, { color: theme.textMuted }]}>{label}</Text>
              <TextInput
                value={(profile[key] as string) ?? ''}
                onChangeText={v => update({ [key]: v } as Partial<ProfileT>)}
                multiline={multi}
                style={[typography.body, { color: theme.textPrimary }]}
              />
            </View>
          ))}
          <Text style={[typography.small, styles.note, { color: theme.textMuted }]}>
            {t('screens.profile.privateNote', 'This never leaves your phone and is never sent to anyone.')}
          </Text>

          <View style={styles.rows}>
            <ListRow title={t('screens.settings.title', 'Settings')} onPress={() => navigation.navigate('Settings')} />
            <ListRow
              title={t('screens.profile.machines', 'My machines')}
              subtitle={t('screens.profile.machinesHint', 'What acts for you when your phone is asleep')}
              onPress={() => navigation.navigate('CadreManager')}
            />
          </View>
        </>
      ) : (
        <Text style={[typography.small, styles.note, { color: theme.textMuted }]}>
          {t('screens.profile.noAccount', 'No account is being created. There is no password and nothing to sign in to.')}
        </Text>
      )}

      <View style={styles.actions}>
        <IconButton
          name="checkmark-outline"
          size={22}
          variant="accent"
          accessibilityLabel={firstRun ? t('common.continue', 'Continue') : t('common.save', 'Save')}
          onPress={save}
          style={dirty || firstRun ? undefined : styles.dim}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing[3], gap: spacing[2] },
  avatarBlock: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], paddingVertical: spacing[2] },
  field: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.card, padding: spacing[2], gap: 2 },
  note: { lineHeight: 18 },
  rows: { gap: spacing[1], paddingTop: spacing[2] },
  actions: { alignItems: 'flex-end', paddingTop: spacing[3] },
  dim: { opacity: 0.5 },
});
