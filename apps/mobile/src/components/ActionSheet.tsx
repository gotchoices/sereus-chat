/**
 * ActionSheet — a menu of choices that does not lose any of them.
 *
 * WHY THIS EXISTS. `Alert.alert` is the obvious control and it is wrong here:
 * React Native's Android implementation takes AT MOST THREE buttons, because
 * Android dialogs have exactly a positive, a negative and a neutral slot. Pass a
 * fourth and it is dropped silently — no warning, no error, the option simply is
 * not there. The app had four such menus, including the message menu with six
 * options, so on Android half of that menu did not exist and neither did the
 * Cancel button underneath it. A user reported it as "there is no way to cancel
 * out of that dialog", which is exactly what it looks like from outside.
 *
 * So: a plain modal list. Any number of options, a cancel that is always present,
 * and dismissal by tapping the backdrop or pressing Back — all three of which do
 * the same nothing-happened thing.
 *
 * `destructive` marks an option that cannot be undone, so it reads differently
 * before it is tapped rather than only in the confirmation afterwards.
 */

import React from 'react';
import { Modal, View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useTheme, typography, spacing, radius } from '../theme';

export interface ActionSheetOption {
  label: string;
  onPress: () => void;
  destructive?: boolean;
  /** Shown under the label — say what the option costs before it is chosen. */
  hint?: string;
  testID?: string;
}

export interface ActionSheetProps {
  visible: boolean;
  title?: string;
  options: ActionSheetOption[];
  cancelLabel: string;
  onDismiss: () => void;
  testID?: string;
}

export function ActionSheet({
  visible, title, options, cancelLabel, onDismiss, testID,
}: ActionSheetProps) {
  const theme = useTheme();

  const choose = (option: ActionSheetOption) => {
    // Close first, then act. A chosen option often navigates or opens a
    // confirmation of its own, and leaving this sheet on top of that is how you
    // end up unable to get back to the list.
    onDismiss();
    option.onPress();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      // Android's Back button. Without this the sheet is a trap on exactly the
      // platform whose dialog limit made it necessary.
      onRequestClose={onDismiss}
      testID={testID}
    >
      <Pressable style={styles.backdrop} onPress={onDismiss} accessibilityLabel={cancelLabel}>
        {/* Swallow taps on the sheet itself so choosing does not also dismiss. */}
        <Pressable style={[styles.sheet, { backgroundColor: theme.surface }]} onPress={() => {}}>
          {title ? (
            <Text style={[typography.small, styles.title, { color: theme.textMuted }]} numberOfLines={2}>
              {title}
            </Text>
          ) : null}

          <ScrollView bounces={false}>
            {options.map((o, i) => (
              <Pressable
                key={`${o.label}-${i}`}
                testID={o.testID}
                accessibilityRole="button"
                accessibilityLabel={o.label}
                onPress={() => choose(o)}
                style={({ pressed }) => [
                  styles.option,
                  { borderTopColor: theme.divider },
                  i === 0 && styles.firstOption,
                  pressed && { backgroundColor: theme.surfaceAlt },
                ]}
              >
                <Text style={[typography.body, { color: o.destructive ? theme.danger : theme.textPrimary }]}>
                  {o.label}
                </Text>
                {o.hint ? (
                  <Text style={[typography.small, { color: theme.textMuted }]}>{o.hint}</Text>
                ) : null}
              </Pressable>
            ))}
          </ScrollView>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={cancelLabel}
            testID="action-sheet-cancel"
            onPress={onDismiss}
            style={({ pressed }) => [
              styles.cancel,
              { backgroundColor: theme.surfaceAlt },
              pressed && { opacity: 0.7 },
            ]}
          >
            <Text style={[typography.body, styles.cancelText, { color: theme.textPrimary }]}>
              {cancelLabel}
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    paddingBottom: spacing[3],
    maxHeight: '80%',
  },
  title: { paddingHorizontal: spacing[3], paddingTop: spacing[3], paddingBottom: spacing[2] },
  option: { paddingHorizontal: spacing[3], paddingVertical: spacing[3], borderTopWidth: StyleSheet.hairlineWidth, gap: 2 },
  firstOption: { borderTopWidth: 0 },
  cancel: {
    marginHorizontal: spacing[3],
    marginTop: spacing[2],
    paddingVertical: spacing[3],
    borderRadius: radius.card,
    alignItems: 'center',
  },
  cancelText: { fontWeight: '600' },
});
