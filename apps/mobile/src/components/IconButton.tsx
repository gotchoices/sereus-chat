/**
 * IconButton — icon-only affordance with a ≥44×44 hit area (ui.md a11y).
 * Colors default to the theme; `variant="accent"` fills with the brand color.
 */

import React from 'react';
import { TouchableOpacity, StyleSheet, View } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useTheme, radius } from '../theme';

export interface IconButtonProps {
  name: string;
  onPress?: () => void;
  size?: number;
  variant?: 'plain' | 'bordered' | 'accent';
  color?: string;
  disabled?: boolean;
  accessibilityLabel?: string;
  testID?: string;
  style?: any;
}

export function IconButton({
  name,
  onPress,
  size = 22,
  variant = 'plain',
  color,
  disabled = false,
  accessibilityLabel,
  testID,
  style,
}: IconButtonProps) {
  const theme = useTheme();

  const iconColor = disabled
    ? theme.textMuted
    : color ?? (variant === 'accent' ? theme.accentText : theme.textPrimary);

  const containerStyle = [
    styles.base,
    variant === 'bordered' && { borderWidth: 1, borderColor: theme.border, borderRadius: radius.control },
    variant === 'accent' && { backgroundColor: theme.accent, borderRadius: radius.control },
    style,
  ];

  return (
    <TouchableOpacity
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={containerStyle}
    >
      <View style={styles.inner}>
        <Ionicons name={name} size={size} color={iconColor} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: { minWidth: 44, minHeight: 44 },
  inner: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
