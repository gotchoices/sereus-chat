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
import type { Prefs, StorageUsage } from '@chat/core';
import { orThrow, useModel } from '../data/bind';
import { useErrorText, useT } from '../i18n';
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
  const model = useModel();
  const navigation: any = useNavigation();
  const t = useT();
  const errorText = useErrorText();
  const theme = useTheme();
  const { setScheme } = useThemeContext() as any;
  const [prefs, setLocal] = useState<Prefs | null>(null);
  const [usage, setUsage] = useState<StorageUsage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void model.prefs.get().then(r => { if (r.ok) setLocal(r.value); });
    void model.media.storageUsage().then(r => (r.ok ? setUsage(r.value) : setError(errorText(r.error))));
  }, [model, errorText]);

  const patch = async (p: Partial<Prefs>) => {
    const next = orThrow(await model.prefs.set(p));
    setLocal(next);
    if (p.theme && typeof setScheme === 'function') setScheme(p.theme);
  };

  if (!prefs) return <View style={{ flex: 1, backgroundColor: theme.background }} />;

  const overCeiling = !!(prefs.storageCeilingBytes && usage && usage.totalBytes > prefs.storageCeilingBytes);

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.content}>
      <SectionHeader label={t('settings.appearance')} />
      <Choice
        value={prefs.theme}
        onChange={v => patch({ theme: v })}
        options={[
          { value: 'system', label: t('settings.system') },
          { value: 'light', label: t('settings.light') },
          { value: 'dark', label: t('settings.dark') },
        ]}
      />

      <SectionHeader label={t('settings.language')} />
      <Choice
        value={prefs.language}
        onChange={v => patch({ language: v })}
        options={[{ value: 'en', label: 'English' }, { value: 'es', label: 'Español' }]}
      />
      <Text style={[typography.small, styles.note, { color: theme.textMuted }]}>
        {t('settings.languageNote')}
      </Text>

      <SectionHeader label={t('settings.notifications')} />
      <Choice
        value={prefs.notifyDefault}
        onChange={v => patch({ notifyDefault: v })}
        options={[
          { value: 'all', label: t('settings.all') },
          { value: 'mentions', label: t('settings.mentions') },
          { value: 'none', label: t('settings.none') },
        ]}
      />
      {/* The limit stated beside the switch, not in a help page. */}
      <Text style={[typography.small, styles.note, { color: theme.textMuted }]}>
        {t('settings.notifyLimit')}
      </Text>
      {prefs.perStrandOverrides > 0 ? (
        <Text style={[typography.small, styles.note, { color: theme.textMuted }]}>
          {t('settings.overrides')
            .replace('{{n}}', String(prefs.perStrandOverrides))}
        </Text>
      ) : null}

      <SectionHeader label={t('settings.storage')} />
      {error ? <Banner message={error} /> : null}
      {overCeiling ? (
        <Banner
          message={t('settings.overCeiling')}
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
        {t('settings.ceilingNote')}
      </Text>

      {/* Dev-only.  Deliberately untranslated and outside the story set: this is a
          workbench for us, not a feature, and it must never appear in a release. */}
      {__DEV__ ? (
        <>
          <SectionHeader label="Developer" />
          <ListRow
            title="Diagnostics"
            subtitle="Run sereus stack checks on this device"
            onPress={() => navigation.navigate('Diagnostics')}
          />
        </>
      ) : null}
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
