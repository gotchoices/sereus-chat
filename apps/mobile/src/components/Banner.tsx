/**
 * Banner — inline status strip.  `error` (default) uses the error tokens;
 * `info` uses a neutral surface.  Optional retry / dismiss action.
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useTheme, typography, spacing, radius } from '../theme';

export interface BannerProps {
  message: string;
  variant?: 'error' | 'info';
  action?: { label: string; onPress: () => void; testID?: string };
  testID?: string;
}

export function Banner({ message, variant = 'error', action, testID }: BannerProps) {
  const theme = useTheme();
  const bg = variant === 'error' ? theme.bannerError : theme.surfaceAlt;
  const fg = variant === 'error' ? theme.danger : theme.textPrimary;
  const icon = variant === 'error' ? 'alert-circle-outline' : 'information-circle-outline';

  return (
    <View testID={testID} style={[styles.banner, { backgroundColor: bg }]}>
      <Ionicons name={icon} size={18} color={fg} style={styles.icon} />
      <Text style={[styles.text, { color: fg }]}>{message}</Text>
      {action ? (
        <TouchableOpacity testID={action.testID} onPress={action.onPress} style={styles.action}>
          <Text style={[styles.actionText, { color: fg }]}>{action.label}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing[2],
    marginHorizontal: spacing[3],
    marginTop: spacing[1],
    borderRadius: radius.control,
  },
  icon: { marginRight: spacing[1] },
  text: { ...typography.small, flex: 1 },
  action: { paddingHorizontal: spacing[1], paddingVertical: 2 },
  actionText: { ...typography.small, fontWeight: '700' },
});
