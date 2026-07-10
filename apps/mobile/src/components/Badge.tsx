/**
 * Badge — pill (radius 999).  Three modes:
 *   - count: numeric, caps at 99 → "99+"
 *   - dot:   small status dot, no text
 *   - label: short text label
 * Color comes from a semantic token (default `danger` for unread counts,
 * `success` for online dots).
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme, radius } from '../theme';

type BadgeProps =
  | { mode: 'count'; count: number; color?: string; testID?: string }
  | { mode: 'dot'; color?: string; testID?: string }
  | { mode: 'label'; label: string; color?: string; testID?: string };

export function Badge(props: BadgeProps) {
  const theme = useTheme();

  if (props.mode === 'dot') {
    return (
      <View
        testID={props.testID}
        style={[styles.dot, { backgroundColor: props.color ?? theme.success }]}
      />
    );
  }

  const bg = props.color ?? theme.danger;
  const text = props.mode === 'count' ? (props.count > 99 ? '99+' : String(props.count)) : props.label;

  return (
    <View testID={props.testID} style={[styles.pill, { backgroundColor: bg }]}>
      <Text style={styles.pillText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  dot: { width: 10, height: 10, borderRadius: radius.pill },
  pill: {
    minWidth: 20,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillText: { color: '#ffffff', fontSize: 12, fontWeight: '600' },
});
