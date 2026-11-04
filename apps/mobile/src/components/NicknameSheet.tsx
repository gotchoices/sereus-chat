/**
 * NicknameSheet — give a member a private name of the user's own (story 30), or take it away.
 *
 * The names already in use are offered to choose again: giving two members of different
 * strands the same name is how the user files them together, by their own judgment. The app
 * never decides two members are the same person.
 *
 * Near the TOP of the screen, with the buttons straight under the field, so the keyboard never
 * covers them: an Android `Modal` is not resized for the keyboard, and on the S7 a centred sheet,
 * then a taller one, put Save under it. A used name saves when tapped, so it can sit lower.
 */

import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TextInput, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useTheme, typography, spacing, radius } from '../theme';

export interface NicknameSheetProps {
  visible: boolean;
  /** The user's current name for them, if any. */
  current: string | null;
  /** Names the user has given anyone, to choose again. */
  used: string[];
  labels: {
    title: string; note: string; placeholder: string; used: string;
    save: string; remove: string; cancel: string;
  };
  onSave: (name: string | null) => void;
  onDismiss: () => void;
}

export function NicknameSheet({ visible, current, used, labels, onSave, onDismiss }: NicknameSheetProps) {
  const theme = useTheme();
  const [text, setText] = useState(current ?? '');
  useEffect(() => { if (visible) setText(current ?? ''); }, [visible, current]);
  const trimmed = text.trim();
  const choices = used.filter(n => n !== trimmed);

  const finish = (name: string | null) => { onDismiss(); onSave(name); };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <Pressable style={styles.backdrop} onPress={onDismiss} accessibilityLabel={labels.cancel}>
        <Pressable style={[styles.sheet, { backgroundColor: theme.surface }]} onPress={() => {}}>
          <Text style={[typography.body, styles.title, { color: theme.textPrimary }]}>{labels.title}</Text>
          <Text style={[typography.small, { color: theme.textMuted }]}>{labels.note}</Text>
          <TextInput
            testID="nickname-input"
            value={text}
            onChangeText={setText}
            placeholder={labels.placeholder}
            placeholderTextColor={theme.textMuted}
            autoFocus
            // A name is often not a dictionary word: the S7's keyboard turned "Roofer" into "Roger".
            autoCorrect={false}
            spellCheck={false}
            autoCapitalize="words"
            maxLength={100}
            returnKeyType="done"
            onSubmitEditing={() => { if (trimmed) finish(trimmed); }}
            style={[typography.body, styles.input, { color: theme.textPrimary, borderColor: theme.border, backgroundColor: theme.surfaceAlt }]}
          />
          <View style={styles.buttons}>
            {current ? (
              <Pressable testID="nickname-remove" accessibilityRole="button" onPress={() => finish(null)} style={styles.button}>
                <Text style={[typography.body, { color: theme.textMuted }]}>{labels.remove}</Text>
              </Pressable>
            ) : <View />}
            <View style={styles.right}>
              <Pressable testID="nickname-cancel" accessibilityRole="button" onPress={onDismiss} style={styles.button}>
                <Text style={[typography.body, { color: theme.textPrimary }]}>{labels.cancel}</Text>
              </Pressable>
              <Pressable testID="nickname-save" accessibilityRole="button" disabled={!trimmed || trimmed === current}
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
                  <Pressable key={n} testID={`nickname-used-${n}`} accessibilityRole="button" accessibilityLabel={n}
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
});
