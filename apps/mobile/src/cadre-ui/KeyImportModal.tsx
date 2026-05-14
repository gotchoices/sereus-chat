/**
 * KeyImportModal — paste a base64url Ed25519 private key to install it as
 * the cadre's authority.
 *
 * Today this is a "restore my key on a fresh install" path: the engine
 * refuses to overwrite a different key that's already present (multi-key
 * add-with-signature awaits the upstream API per upstream report §2).
 */

import React, { useMemo, useState } from 'react';
import {
  Alert,
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
  /** Returns the derived public key on success, throws otherwise. */
  onImport: (privateKeyB64u: string) => Promise<{ publicKey: string }>;
}

export default function KeyImportModal({ visible, onClose, onImport }: Props) {
  const theme = useCadreTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setText('');
    setBusy(false);
    setError(null);
  };

  const close = () => {
    reset();
    onClose();
  };

  const submit = async () => {
    const v = text.trim();
    if (!v) {
      setError('Paste a base64url private key');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { publicKey } = await onImport(v);
      Alert.alert('Imported', `Authority key installed (${publicKey.slice(0, 12)}…).`);
      reset();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>Import recovery key</Text>
            <TouchableOpacity onPress={close} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={22} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>
          <Text style={styles.hint}>
            Paste a previously-exported base64url private key.  Treat the source as you would
            any password — it grants full authority over your cadre.
          </Text>
          <TextInput
            style={styles.input}
            placeholder="abc123…"
            placeholderTextColor={theme.textMuted}
            value={text}
            onChangeText={(t) => { setText(t); setError(null); }}
            autoCapitalize="none"
            autoCorrect={false}
            multiline
            editable={!busy}
            testID="cadre-import-input"
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
            >
              <Text style={styles.btnPrimaryText}>{busy ? 'Importing…' : 'Import'}</Text>
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
