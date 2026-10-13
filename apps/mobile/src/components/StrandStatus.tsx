/**
 * StrandStatus — what a strand *is*, said in a sentence rather than a bare badge.
 *
 * Three states, and only three (design/specs/mobile/screens/strand-detail.md):
 *   public          anyone with the link can join; nobody can be removed
 *   canChange       only invited people; N of them can add or remove anyone
 *   settled         nobody can be added or removed, ever
 *
 * Derived ONLY from recorded state — visibility and managerCount.  Never from
 * activity, last-seen, or how long somebody has been quiet: there is no notion
 * of a person being "gone" upstream, and none may be invented here.  A strand
 * whose only manager vanished a year ago still reads "can change", because that
 * is what is true.
 *
 * Appears wherever a member decides whether to say something: strand rows, the
 * conversation header, strand detail, and — most importantly — before accepting
 * an invitation, which is the one moment somebody can judge a strand without
 * having disclosed themselves.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme, typography, spacing, radius } from '../theme';
import { useT } from '../i18n';
import { strandStatusKind, type StrandState, type StrandStatusKind } from '@chat/core';
import type { Translator } from '@chat/resources';

export { strandStatusKind };
export type { StrandStatusKind };

export interface StrandStatusProps {
  state: StrandState;
  /** `compact` still distinguishes all three; `full` explains. */
  variant?: 'compact' | 'full';
  testID?: string;
}

function sentence(t: Translator, kind: StrandStatusKind, state: StrandState): string {
  if (kind !== 'canChange') return t(`status.strand.${kind}.sentence`);
  const n = state.managerCount;
  const who = n === 1 ? t('status.strand.canChange.one') : t('status.strand.canChange.many', undefined, { n });
  const you = state.canIManage ? t('status.strand.canChange.includingYou') : t('status.strand.canChange.youRemovable');
  return t('status.strand.canChange.sentence', undefined, { who, you });
}

export function StrandStatus({ state, variant = 'full', testID }: StrandStatusProps) {
  const theme = useTheme();
  const t = useT();
  const kind = strandStatusKind(state);
  const label = t(`status.strand.${kind}.label`);

  // Semantic, not decorative: settled is the only reassuring one.
  const tint =
    kind === 'settled' ? theme.success : kind === 'public' ? theme.danger : theme.textMuted;

  if (variant === 'compact') {
    return (
      <View testID={testID} style={styles.compactRow}>
        <View style={[styles.dot, { backgroundColor: tint }]} />
        <Text style={[typography.small, { color: theme.textMuted }]} numberOfLines={1}>
          {label}
        </Text>
      </View>
    );
  }

  return (
    <View
      testID={testID}
      accessibilityRole="summary"
      style={[styles.card, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}
    >
      <View style={styles.compactRow}>
        <View style={[styles.dot, { backgroundColor: tint }]} />
        <Text style={[typography.body, styles.label, { color: theme.textPrimary }]}>{label}</Text>
      </View>
      <Text style={[typography.body, styles.sentence, { color: theme.textMuted }]}>
        {sentence(t, kind, state)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  compactRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[1] },
  dot: { width: 8, height: 8, borderRadius: radius.pill },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.card,
    padding: spacing[3],
    gap: spacing[1],
  },
  label: { fontWeight: '600' },
  sentence: { lineHeight: 20 },
});
