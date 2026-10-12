/**
 * NodeCodeModal — paste a machine's node code (`sereus-join:…`), the text a cadre node
 * shows while it waits to be claimed. The screen reads the code and asks before
 * claiming; this only collects the text.
 *
 * The code carries the node's one-time claim secret: it is never logged.
 */

import React, { useMemo, useState } from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useCadreTheme, type CadreManagerTheme } from './theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Read the pasted code: `null` when it is usable (the modal closes), else what is wrong. */
  onSubmit: (code: string) => Promise<string | null>;
}

export default function NodeCodeModal({ visible, onClose, onSubmit }: Props) {
  const theme = useCadreTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setText('');
    setBusy(false);
    setError(null);
    onClose();
  };

  const submit = async () => {
    const v = text.trim();
    if (!v) return;
    setBusy(true);
    setError(null);
    const problem = await onSubmit(v);
    setBusy(false);
    if (problem) setError(problem);
    else close();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>Paste a node code</Text>
            <TouchableOpacity onPress={close} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={22} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>
          <Text style={styles.hint}>
            A machine waiting to join shows a code starting with sereus-join:. Paste it here
            to add that machine to your network.
          </Text>
          <TextInput
            style={styles.input}
            placeholder="sereus-join:…"
            placeholderTextColor={theme.textMuted}
            value={text}
            onChangeText={(t) => { setText(t); setError(null); }}
            autoCapitalize="none"
            autoCorrect={false}
            multiline
            editable={!busy}
            testID="cadre-node-code-input"
          />
          {error && <Text style={styles.error}>{error}</Text>}
          <View style={styles.actions}>
            <TouchableOpacity style={styles.btnSecondary} onPress={close} disabled={busy}>
              <Text style={styles.btnSecondaryText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btnPrimary, (busy || !text.trim()) && { opacity: 0.5 }]}
              onPress={submit}
              disabled={busy || !text.trim()}
              testID="cadre-node-code-next"
            >
              <Text style={styles.btnPrimaryText}>Next</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function makeStyles(theme: CadreManagerTheme) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: theme.backdrop,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 16,
    },
    card: {
      width: '100%',
      maxWidth: 480,
      backgroundColor: theme.surface,
      borderRadius: 12,
      padding: 16,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    title: { fontSize: 17, fontWeight: '700', color: theme.textPrimary },
    hint: { fontSize: 13, color: theme.textSecondary, marginBottom: 10 },
    input: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 8,
      padding: 10,
      fontFamily: 'monospace',
      fontSize: 12,
      color: theme.textPrimary,
      minHeight: 80,
      maxHeight: 160,
      backgroundColor: theme.background,
      marginBottom: 8,
    },
    error: { color: theme.danger, marginBottom: 8, fontSize: 13 },
    actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 8 },
    btnPrimary: {
      backgroundColor: theme.accent,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 8,
    },
    btnPrimaryText: { color: theme.accentText, fontWeight: '600' },
    btnSecondary: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 8,
    },
    btnSecondaryText: { color: theme.accent, fontWeight: '600' },
  });
}
