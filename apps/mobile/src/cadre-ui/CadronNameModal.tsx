/**
 * CadronNameModal — the person's own name for one of their cadrons ("kjeib", "home server"),
 * shown in the machine list and in an invitation's readable view. Kept on this device
 * (`@serfab/cadre-client`'s cadron preferences). An empty name clears it.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useCadreTheme, type CadreManagerTheme } from './theme';

interface Props {
  visible: boolean;
  /** The name it has now, if any. */
  initial: string;
  /** Who is being named, e.g. "Machine …28c4yw9L". */
  subject: string;
  onClose: () => void;
  onSave: (name: string) => void;
}

export default function CadronNameModal({ visible, initial, subject, onClose, onSave }: Props) {
  const theme = useCadreTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [text, setText] = useState(initial);
  useEffect(() => { if (visible) setText(initial); }, [visible, initial]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>Name this machine</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={22} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>
          <Text style={styles.hint}>{subject}. The name is yours alone: only this device keeps it.</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. home server"
            placeholderTextColor={theme.textMuted}
            value={text}
            onChangeText={setText}
            autoFocus
            maxLength={40}
            testID="cadron-name-input"
          />
          <View style={styles.actions}>
            <TouchableOpacity style={styles.btnSecondary} onPress={onClose}>
              <Text style={styles.btnSecondaryText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btnPrimary} onPress={() => { onSave(text.trim()); onClose(); }} testID="cadron-name-save">
              <Text style={styles.btnPrimaryText}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function makeStyles(theme: CadreManagerTheme) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: theme.backdrop, alignItems: 'center', justifyContent: 'center', padding: 16 },
    card: { width: '100%', maxWidth: 480, backgroundColor: theme.surface, borderRadius: 12, padding: 16 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    title: { fontSize: 17, fontWeight: '700', color: theme.textPrimary },
    hint: { fontSize: 13, color: theme.textSecondary, marginBottom: 10 },
    input: {
      borderWidth: 1, borderColor: theme.border, borderRadius: 8, padding: 10,
      fontSize: 15, color: theme.textPrimary, backgroundColor: theme.background, marginBottom: 8,
    },
    actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 8 },
    btnPrimary: { backgroundColor: theme.accent, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8 },
    btnPrimaryText: { color: theme.accentText, fontWeight: '600' },
    btnSecondary: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8 },
    btnSecondaryText: { color: theme.accent, fontWeight: '600' },
  });
}
