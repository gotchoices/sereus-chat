/**
 * SectionHeader — muted uppercase label with an optional trailing add action.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { IconButton } from './IconButton';
import { useTheme, typography, spacing } from '../theme';

export interface SectionHeaderProps {
  label: string;
  onAdd?: () => void;
  addLabel?: string;
  testID?: string;
}

export function SectionHeader({ label, onAdd, addLabel, testID }: SectionHeaderProps) {
  const theme = useTheme();
  return (
    <View style={styles.row} testID={testID}>
      <Text style={[styles.label, { color: theme.textSecondary }]}>{label.toUpperCase()}</Text>
      {onAdd ? (
        <IconButton name="add" size={20} onPress={onAdd} accessibilityLabel={addLabel ?? 'Add'} variant="plain" />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[3],
    paddingTop: spacing[3],
    paddingBottom: spacing[1],
  },
  label: { ...typography.small, fontWeight: '700', letterSpacing: 0.5 },
});
