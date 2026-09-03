/**
 * Settings — appearance, language, notifications, storage.  Device-scoped.
 * Spec: design/specs/mobile/screens/settings.md
 *
 * FOUR SECTIONS.  Do not add more.  There is no account, sign-out, password or
 * privacy group here, and their absence is designed rather than missing: no
 * account was ever created, who can read a conversation belongs to that strand,
 * and nothing is collected to opt out of.
 */

import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { getPrefs, setPrefs, storageUsage } from '../data/adapter';
import type { Prefs, StorageUsage } from '../data/types';
import { useT } from '../i18n';
import { Banner, ListRow, SectionHeader } from '../components';
import { useTheme, useThemeContext, typography, spacing, radius } from '../theme';

const MB = 1024 * 1024;
const size = (b: number) => (b >= 1024 * MB ? `${(b / (1024 * MB)).toFixed(1)} GB` : `${Math.round(b / MB)} MB`);

function Choice<T extends string>({ options, value, onChange }: {
  options: Array<{ value: T; label: string }>; value: T; onChange: (v: T) => void;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.choice, { borderColor: theme.border }]}>
      {options.map(o => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            style={[styles.choiceItem, on && { backgroundColor: theme.accent }]}
          >
            <Text style={[typography.small, { color: on ? theme.accentText : theme.textPrimary }]}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function Settings() {
  const navigation: any = useNavigation();
  const t = useT();
  const theme = useTheme();
  const { setScheme } = useThemeContext() as any;
  const [prefs, setLocal] = useState<Prefs | null>(null);
  const [usage, setUsage] = useState<StorageUsage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getPrefs().then(setLocal).catch(() => {});
    storageUsage().then(setUsage).catch(e => setError(e?.message ?? 'Could not measure storage'));
  }, []);

  const patch = async (p: Partial<Prefs>) => {
    const next = await setPrefs(p);
    setLocal(next);
    if (p.theme && typeof setScheme === 'function') setScheme(p.theme);
  };

  if (!prefs) return <View style={{ flex: 1, backgroundColor: theme.background }} />;

  const overCeiling = !!(prefs.storageCeilingBytes && usage && usage.totalBytes > prefs.storageCeilingBytes);

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.content}>
      <SectionHeader label={t('screens.settings.appearance', 'Appearance')} />
      <Choice
        value={prefs.theme}
        onChange={v => patch({ theme: v })}
        options={[
          { value: 'system', label: t('screens.settings.system', 'System') },
          { value: 'light', label: t('screens.settings.light', 'Light') },
          { value: 'dark', label: t('screens.settings.dark', 'Dark') },
        ]}
      />

      <SectionHeader label={t('screens.settings.language', 'Language')} />
      <Choice
        value={prefs.language}
        onChange={v => patch({ language: v })}
        options={[{ value: 'en', label: 'English' }, { value: 'es', label: 'Español' }]}
      />
      <Text style={[typography.small, styles.note, { color: theme.textMuted }]}>
        {t('screens.settings.languageNote', "Only the app's own words change. Messages are never translated.")}
      </Text>

      <SectionHeader label={t('screens.settings.notifications', 'Notifications')} />
      <Choice
        value={prefs.notifyDefault}
        onChange={v => patch({ notifyDefault: v })}
        options={[
          { value: 'all', label: t('screens.settings.all', 'Everything') },
          { value: 'mentions', label: t('screens.settings.mentions', 'When named') },
          { value: 'none', label: t('screens.settings.none', 'Nothing') },
        ]}
      />
      {/* The limit stated beside the switch, not in a help page. */}
      <Text style={[typography.small, styles.note, { color: theme.textMuted }]}>
        {t('screens.settings.notifyLimit',
          'This decides what the app tells you. Whether anything can reach a sleeping phone depends on something of yours being awake.')}
      </Text>
      {prefs.perStrandOverrides > 0 ? (
        <Text style={[typography.small, styles.note, { color: theme.textMuted }]}>
          {t('screens.settings.overrides', '{{n}} strands have their own setting, which this does not change.')
            .replace('{{n}}', String(prefs.perStrandOverrides))}
        </Text>
      ) : null}

      <SectionHeader label={t('screens.settings.storage', 'Storage')} />
      {error ? <Banner message={error} /> : null}
      {overCeiling ? (
        <Banner
          message={t('screens.settings.overCeiling',
            'You are at the limit you set. Nothing has been deleted — raise the limit, trim what you are holding, or add a machine.')}
        />
      ) : null}
      {usage ? (
        <>
          <Text style={[typography.body, { color: theme.textPrimary }]}>
            {size(usage.totalBytes)}
            {prefs.storageCeilingBytes ? ` / ${size(prefs.storageCeilingBytes)}` : ''}
          </Text>
          <View style={styles.rows}>
            {usage.byStrand.map(s => (
              <ListRow
                key={s.strandId}
                title={s.title}
                subtitle={size(s.bytes)}
                onPress={() => navigation.navigate('StrandMedia', { strandId: s.strandId, title: s.title })}
              />
            ))}
          </View>
        </>
      ) : null}
      <Text style={[typography.small, styles.note, { color: theme.textMuted }]}>
        {t('screens.settings.ceilingNote', 'The limit is yours to set. Nothing is imposed, and nothing is deleted on your behalf.')}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing[3], gap: spacing[1], paddingBottom: spacing[5] },
  choice: { flexDirection: 'row', borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.control, overflow: 'hidden' },
  choiceItem: { flex: 1, alignItems: 'center', paddingVertical: spacing[1] },
  note: { lineHeight: 18, paddingBottom: spacing[1] },
  rows: { gap: spacing[1], paddingTop: spacing[1] },
});
