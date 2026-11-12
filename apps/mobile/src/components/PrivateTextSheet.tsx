/**
 * PrivateTextSheet — edit a piece of text only the user's own machines hold: a member's
 * private name (story 30) or the user's note on a strand. Saving with nothing removes it.
 *
 * For names, the names already in use are offered to choose again: giving two members of
 * different strands the same name is how the user files them together, by their own judgment
 * (the app never decides two members are the same person). `everywhere` offers to change a
 * name on every member that carries it.
 *
 * Near the TOP of the screen, with the buttons straight under the field, so the keyboard never
 * covers them: an Android `Modal` is not resized for the keyboard, and on the S7 a centred sheet,
 * then a taller one, put Save under it. A used name saves when tapped, so it can sit lower.
 */

import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TextInput, Pressable, ScrollView, StyleSheet, Switch } from 'react-native';
import { useTheme, typography, spacing, radius } from '../theme';

export interface PrivateTextSheetProps {
  visible: boolean;
  /** The current text, if any. */
  current: string | null;
  /** Earlier values to choose again (names the user has given anyone); none for a note. */
  used?: string[];
  /** A note is longer and wraps; a name is one line. */
  multiline?: boolean;
  maxLength?: number;
  /** Offer "change it for all N" (a name other members also carry). */
  everywhere?: { label: string };
  labels: {
    title: string; note: string; placeholder: string; used: string;
    save: string; remove: string; cancel: string;
  };
  onSave: (text: string | null, opts: { everywhere: boolean }) => void;
  onDismiss: () => void;
}

export function PrivateTextSheet({ visible, current, used = [], multiline = false, maxLength = 100, everywhere, labels, onSave, onDismiss }: PrivateTextSheetProps) {
  const theme = useTheme();
  const [text, setText] = useState(current ?? '');
  const [all, setAll] = useState(false);
  useEffect(() => { if (visible) { setText(current ?? ''); setAll(false); } }, [visible, current]);
  const trimmed = text.trim();
  const choices = used.filter(n => n !== trimmed);

  const finish = (value: string | null) => { onDismiss(); onSave(value, { everywhere: all && !!everywhere }); };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <Pressable style={styles.backdrop} onPress={onDismiss} accessibilityLabel={labels.cancel}>
        <Pressable style={[styles.sheet, { backgroundColor: theme.surface }]} onPress={() => {}}>
          <Text style={[typography.body, styles.title, { color: theme.textPrimary }]}>{labels.title}</Text>
          <Text style={[typography.small, { color: theme.textMuted }]}>{labels.note}</Text>
          <TextInput
            testID="private-text-input"
            value={text}
            onChangeText={setText}
            placeholder={labels.placeholder}
            placeholderTextColor={theme.textMuted}
            autoFocus
            // A name is often not a dictionary word: the S7's keyboard turned "Roofer" into "Roger".
            autoCorrect={false}
            spellCheck={false}
            autoCapitalize="words"
            maxLength={maxLength}
            multiline={multiline}
            returnKeyType={multiline ? 'default' : 'done'}
            onSubmitEditing={() => { if (!multiline && trimmed) finish(trimmed); }}
            style={[typography.body, styles.input, multiline && styles.multiline, { color: theme.textPrimary, borderColor: theme.border, backgroundColor: theme.surfaceAlt }]}
          />
          {everywhere ? (
            <View style={styles.everywhere}>
              <Text style={[typography.small, styles.everywhereText, { color: theme.textPrimary }]}>{everywhere.label}</Text>
              <Switch testID="private-text-everywhere" value={all} onValueChange={setAll} />
            </View>
          ) : null}
          <View style={styles.buttons}>
            {current ? (
              <Pressable testID="private-text-remove" accessibilityRole="button" onPress={() => finish(null)} style={styles.button}>
                <Text style={[typography.body, { color: theme.textMuted }]}>{labels.remove}</Text>
              </Pressable>
            ) : <View />}
            <View style={styles.right}>
              <Pressable testID="private-text-cancel" accessibilityRole="button" onPress={onDismiss} style={styles.button}>
                <Text style={[typography.body, { color: theme.textPrimary }]}>{labels.cancel}</Text>
              </Pressable>
              <Pressable testID="private-text-save" accessibilityRole="button" disabled={!trimmed || trimmed === current}
                onPress={() => finish(trimmed)} style={styles.button}>
                <Text style={[typography.body, styles.save, { color: !trimmed || trimmed === current ? theme.textMuted : theme.accent }]}>
                  {labels.save}
                </Text>
              </Pressable>
            </View>
          </View>
          {choices.length ? (
            <>
              <Text style={[typography.small, { color: theme.textMuted }]}>{labels.used}</Text>
              <ScrollView horizontal keyboardShouldPersistTaps="handled" contentContainerStyle={styles.chips}>
                {choices.map(n => (
                  <Pressable key={n} testID={`private-text-used-${n}`} accessibilityRole="button" accessibilityLabel={n}
                    onPress={() => finish(n)}
                    style={({ pressed }) => [styles.chip, { borderColor: theme.border }, pressed && { backgroundColor: theme.surfaceAlt }]}>
                    <Text style={[typography.small, { color: theme.textPrimary }]}>{n}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-start', padding: spacing[3], paddingTop: spacing[5] },
  sheet: { borderRadius: radius.card, padding: spacing[3], gap: spacing[2] },
  title: { fontWeight: '600' },
  input: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.card, paddingHorizontal: spacing[2], paddingVertical: spacing[2] },
  chips: { gap: spacing[1] },
  chip: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.card, paddingHorizontal: spacing[2], paddingVertical: spacing[1] },
  buttons: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  right: { flexDirection: 'row', gap: spacing[2] },
  button: { paddingVertical: spacing[1], paddingHorizontal: spacing[1] },
  save: { fontWeight: '600' },
  multiline: { minHeight: 88, textAlignVertical: 'top' },
  everywhere: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  everywhereText: { flex: 1 },
});
