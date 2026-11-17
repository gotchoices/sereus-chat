/**
 * StrandWorkLine — a slim line over every screen while strand work may pause the app
 * (`strands.busy`: starting strands, catching up after a return, checking quiet ones). On a slow
 * phone that work blocks JavaScript for a few seconds; this says why the app paused rather than
 * leaving it looking hung.
 *
 * The spinner is the native `ActivityIndicator`, which Android animates on its own thread, so it
 * keeps turning while JavaScript is blocked. The model signals a moment before the work starts,
 * so the line is drawn before the pause. It takes no touches.
 */

import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import type { StrandWork } from '@chat/core';
import { useModel } from '../data/bind';
import { useT } from '../i18n';
import { useTheme, typography, spacing, radius } from '../theme';

export function StrandWorkLine() {
  const model = useModel();
  const t = useT();
  const theme = useTheme();
  const [work, setWork] = useState<StrandWork | null>(() => model.strands.busy());

  useEffect(() => model.changes.busy(() => setWork(model.strands.busy())), [model]);

  if (!work) return null;
  return (
    <View pointerEvents="none" style={styles.wrap} testID="strand-work">
      <View style={[styles.pill, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <ActivityIndicator size="small" color={theme.textMuted} />
        <Text style={[typography.small, { color: theme.textMuted }]}>{t(`strands.work.${work}`)}</Text>
      </View>
    </View>
  );
}

/** The native stack header's height on Android. */
const HEADER_HEIGHT = 56;

const styles = StyleSheet.create({
  // Just under the screen header, clear of the composer and the list's footer.
  wrap: { position: 'absolute', left: 0, right: 0, top: HEADER_HEIGHT + spacing[1], alignItems: 'center' },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: spacing[2],
    paddingHorizontal: spacing[3], paddingVertical: spacing[1],
    borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth,
  },
});
