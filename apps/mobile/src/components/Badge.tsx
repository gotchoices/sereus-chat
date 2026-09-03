/**
 * Badge — pill (radius 999).  Modes:
 *   - count:   numeric, caps at 99 → "99+"
 *   - mention: the user was named — outranks a count, because being named is
 *              the only thing that should be able to interrupt
 *   - draft:   an unsent message waits in this strand
 *   - muted:   quieted; carries no count, deliberately.  An unread number on a
 *              muted strand re-creates the pressure muting removed
 *   - dot:     small status dot, no text
 *   - label:   short text label
 *
 * A row shows at most ONE, in the precedence set by
 * design/specs/mobile/screens/strand-list.md: mention → count → draft → muted.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme, radius } from '../theme';

type BadgeProps =
  | { mode: 'count'; count: number; color?: string; testID?: string }
  | { mode: 'mention'; color?: string; testID?: string }
  | { mode: 'draft'; color?: string; testID?: string }
  | { mode: 'muted'; color?: string; testID?: string }
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

  if (props.mode === 'muted' || props.mode === 'draft') {
    // Quiet by design: a muted or drafting strand states its condition without
    // competing for attention.
    return (
      <View testID={props.testID} style={[styles.quiet, { borderColor: theme.border }]}>
        <Text style={[styles.quietText, { color: theme.textMuted }]}>
          {props.mode === 'muted' ? 'Muted' : 'Draft'}
        </Text>
      </View>
    );
  }

  const bg =
    props.color ?? (props.mode === 'mention' ? theme.accent : theme.danger);
  const text =
    props.mode === 'count'
      ? props.count > 99
        ? '99+'
        : String(props.count)
      : props.mode === 'mention'
        ? '@'
        : props.label;

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
  quiet: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  quietText: { fontSize: 11, fontWeight: '500' },
});
