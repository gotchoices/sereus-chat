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
import type { StrandState } from '../data/types';

export type StrandStatusKind = 'public' | 'canChange' | 'settled';

export function strandStatusKind(state: StrandState): StrandStatusKind {
  if (state.visibility === 'public') return 'public';
  return state.managerCount === 0 ? 'settled' : 'canChange';
}

export interface StrandStatusProps {
  state: StrandState;
  /** `compact` still distinguishes all three; `full` explains. */
  variant?: 'compact' | 'full';
  testID?: string;
}

const LABEL: Record<StrandStatusKind, string> = {
  public: 'Open to anyone',
  canChange: 'Can still change',
  settled: 'Settled',
};

function sentence(kind: StrandStatusKind, state: StrandState): string {
  switch (kind) {
    case 'public':
      return 'Anyone with the link can join. Nobody can be removed.';
    case 'settled':
      return 'Nobody can be added or removed. This is who it will always be.';
    case 'canChange': {
      const n = state.managerCount;
      const who = n === 1 ? 'One person' : `${n} people`;
      const you = state.canIManage ? ' — including you' : ', including you being removed';
      return `Only invited people are here. ${who} can add or remove anyone${you}.`;
    }
  }
}

export function StrandStatus({ state, variant = 'full', testID }: StrandStatusProps) {
  const theme = useTheme();
  const kind = strandStatusKind(state);

  // Semantic, not decorative: settled is the only reassuring one.
  const tint =
    kind === 'settled' ? theme.success : kind === 'public' ? theme.danger : theme.textMuted;

  if (variant === 'compact') {
    return (
      <View testID={testID} style={styles.compactRow}>
        <View style={[styles.dot, { backgroundColor: tint }]} />
        <Text style={[typography.small, { color: theme.textMuted }]} numberOfLines={1}>
          {LABEL[kind]}
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
        <Text style={[typography.body, styles.label, { color: theme.textPrimary }]}>{LABEL[kind]}</Text>
      </View>
      <Text style={[typography.body, styles.sentence, { color: theme.textMuted }]}>
        {sentence(kind, state)}
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
