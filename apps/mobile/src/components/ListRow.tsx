/**
 * ListRow — a tappable card row: leading slot (usually an Avatar), a
 * title + one-line truncated subtitle, and an optional trailing slot
 * (Badge / timestamp / chevron).  Cards, not hairline dividers (ui.md).
 */

import React from 'react';
import { TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { useTheme, typography, spacing, radius } from '../theme';

export interface ListRowProps {
  title: string;
  subtitle?: string | null;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  onPress?: () => void;
  testID?: string;
}

export function ListRow({ title, subtitle, leading, trailing, onPress, testID }: ListRowProps) {
  const theme = useTheme();
  return (
    <TouchableOpacity
      testID={testID}
      activeOpacity={0.7}
      onPress={onPress}
      style={[styles.row, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}
    >
      {leading ? <View style={styles.leading}>{leading}</View> : null}
      <View style={styles.center}>
        <Text numberOfLines={1} style={[styles.title, { color: theme.textPrimary }]}>
          {title}
        </Text>
        {subtitle != null && subtitle !== '' ? (
          <Text numberOfLines={1} style={[styles.subtitle, { color: theme.textSecondary }]}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    paddingVertical: spacing[1],
    paddingHorizontal: spacing[2],
    borderWidth: 1,
    borderRadius: radius.card,
    marginBottom: spacing[1],
  },
  leading: { marginRight: spacing[2] },
  center: { flex: 1, justifyContent: 'center' },
  title: { ...typography.body, fontWeight: '600' },
  subtitle: { ...typography.small, marginTop: 2 },
  trailing: { marginLeft: spacing[2], alignItems: 'flex-end', justifyContent: 'center' },
});
