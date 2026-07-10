/**
 * EmptyState — centered icon + title + one-line hint, plus an optional CTA.
 * ui.md: "never a bare sentence."
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useTheme, typography, spacing, radius } from '../theme';

export interface EmptyStateProps {
  icon?: string;
  title: string;
  hint?: string;
  cta?: { label: string; onPress: () => void; testID?: string };
  testID?: string;
  hintTestID?: string;
}

export function EmptyState({ icon = 'chatbubbles-outline', title, hint, cta, testID, hintTestID }: EmptyStateProps) {
  const theme = useTheme();
  return (
    <View style={styles.container} testID={testID}>
      <Ionicons name={icon} size={56} color={theme.textMuted} style={styles.icon} />
      <Text style={[styles.title, { color: theme.textPrimary }]}>{title}</Text>
      {hint ? (
        <Text testID={hintTestID} style={[styles.hint, { color: theme.textSecondary }]}>
          {hint}
        </Text>
      ) : null}
      {cta ? (
        <TouchableOpacity
          testID={cta.testID}
          onPress={cta.onPress}
          style={[styles.cta, { backgroundColor: theme.accent }]}
        >
          <Text style={[styles.ctaText, { color: theme.accentText }]}>{cta.label}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing[4] },
  icon: { marginBottom: spacing[2] },
  title: { ...typography.title, textAlign: 'center', marginBottom: spacing[1] },
  hint: { ...typography.body, textAlign: 'center', marginBottom: spacing[3], lineHeight: 22 },
  cta: { paddingVertical: spacing[2], paddingHorizontal: spacing[4], borderRadius: radius.control },
  ctaText: { ...typography.body, fontWeight: '600' },
});
