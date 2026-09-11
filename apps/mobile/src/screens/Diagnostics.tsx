/**
 * Diagnostics — dev-only. Runs stack checks inside React Native.
 *
 * Not a user-facing screen and not specified by any story: it exists so a
 * question we would otherwise answer by rebuilding the app can be answered by
 * tapping a row. Reachable only under `__DEV__`, from Settings.
 *
 * The first check is the RN half of an A/B against `test/stack/found-strand.mjs`,
 * which founds the same strand in Node in ~0.2 s. Identical logic, one variable:
 * the runtime.
 */

import React, { useCallback, useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { runFoundStrandCheck } from '../diagnostics/found-strand-check';
import type { CheckResult } from '../diagnostics/found-strand-check';
import { SectionHeader } from '../components';
import { useTheme, typography, spacing, radius } from '../theme';

type Variant = { label: string; strandFilter: 'all' | 'sAppId'; note: string };

/* Two configurations, because `strandFilter` is one of the few remaining
   differences between our CadreService and both the sereus reference app and the
   Node harness. Cheap to test, so worth being able to. */
const VARIANTS: Variant[] = [
  { label: 'Found a strand', strandFilter: 'all', note: 'matches the Node harness and the reference app' },
  { label: 'Found a strand (sAppId filter)', strandFilter: 'sAppId', note: 'matches what our CadreService passes' },
];

const TIMEOUT_MS = 10 * 60 * 1000;

export default function Diagnostics() {
  const theme = useTheme();
  const [running, setRunning] = useState<string | null>(null);
  const [lines, setLines] = useState<string[]>([]);
  const [result, setResult] = useState<CheckResult | null>(null);
  const scroller = useRef<ScrollView | null>(null);

  const run = useCallback(async (v: Variant) => {
    setRunning(v.label);
    setResult(null);
    setLines([`Running "${v.label}" — this can take minutes; leave the screen open.`]);
    try {
      const r = await runFoundStrandCheck({
        timeoutMs: TIMEOUT_MS,
        strandFilter: v.strandFilter,
        onProgress: line => setLines(prev => [...prev, line]),
      });
      setResult(r);
    } catch (err) {
      setLines(prev => [...prev, `harness error: ${err instanceof Error ? err.message : String(err)}`]);
    } finally {
      setRunning(null);
    }
  }, []);

  return (
    <ScrollView
      ref={scroller}
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.content}
      onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: true })}
    >
      <SectionHeader label="Stack checks" />
      <Text style={[typography.small, styles.blurb, { color: theme.textMuted }]}>
        Each runs on its own throwaway node and its own databases, so nothing here touches your
        strands. The app’s own strand work keeps running while a check does, and competes for the
        same processor — so read a slow result as an upper bound, not a measurement.
      </Text>

      {VARIANTS.map(v => (
        <Pressable
          key={v.label}
          disabled={running !== null}
          onPress={() => run(v)}
          style={[
            styles.row,
            { borderColor: theme.border, backgroundColor: theme.surfaceAlt },
            running !== null && styles.dim,
          ]}
        >
          <View style={styles.flex1}>
            <Text style={[typography.body, styles.rowTitle, { color: theme.textPrimary }]}>{v.label}</Text>
            <Text style={[typography.small, { color: theme.textMuted }]}>{v.note}</Text>
          </View>
          {running === v.label ? <ActivityIndicator /> : null}
        </Pressable>
      ))}

      {result ? (
        <View
          style={[
            styles.verdict,
            { borderColor: result.converged ? theme.accent : theme.border, backgroundColor: theme.surfaceAlt },
          ]}
        >
          <Text style={[typography.title, { color: theme.textPrimary }]}>
            {result.converged ? 'Converged' : 'Did not converge'}
          </Text>
          <Text style={[typography.body, { color: theme.textMuted }]}>{result.detail}</Text>
          <Text style={[typography.small, styles.compare, { color: theme.textSecondary }]}>
            The same founding in Node takes about 0.2s — see test/stack/found-strand.mjs.
          </Text>
        </View>
      ) : null}

      {lines.length ? (
        <>
          <SectionHeader label="Trace" />
          <View style={[styles.trace, { borderColor: theme.border }]}>
            {lines.map((l, i) => (
              <Text key={i} style={[styles.mono, { color: theme.textMuted }]}>{l}</Text>
            ))}
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing[3], gap: spacing[2] },
  blurb: { lineHeight: 18 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing[2],
    borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.card, padding: spacing[3],
  },
  rowTitle: { fontWeight: '600' },
  flex1: { flex: 1 },
  dim: { opacity: 0.5 },
  verdict: {
    borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.card,
    padding: spacing[3], gap: spacing[1],
  },
  compare: { paddingTop: spacing[1] },
  trace: {
    borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.card, padding: spacing[2],
  },
  mono: { fontFamily: 'monospace', fontSize: 11, lineHeight: 16 },
});
