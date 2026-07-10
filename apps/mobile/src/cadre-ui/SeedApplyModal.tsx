/**
 * SeedApplyModal — paste a base64url cadre seed (produced by another node, e.g.
 * a drone/server via cadre-cli) to join that cadre.
 *
 * The seed carries the peers to dial and the authority that signed it; applying
 * it connects this device to the cadre so its control network gains a cohort.
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
  /** Apply the pasted seed; returns how many peers were added, throws on failure. */
  onApply: (encodedSeed: string) => Promise<{ peersAdded: number }>;
}

export default function SeedApplyModal({ visible, onClose, onApply }: Props) {
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
      setError('Paste a seed code');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { peersAdded } = await onApply(v);
      Alert.alert(
        'Connected',
        `Seed applied — ${peersAdded} peer(s) added to your cadre.`,
      );
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
            <Text style={styles.title}>Join with a seed</Text>
            <TouchableOpacity onPress={close} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={22} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>
          <Text style={styles.hint}>
            Paste a seed code produced by another node in your cadre (for example a
            drone or server via cadre-cli). This connects your phone to that node.
          </Text>
          <TextInput
            style={styles.input}
            placeholder="seed:…"
            placeholderTextColor={theme.textMuted}
            value={text}
            onChangeText={(t) => { setText(t); setError(null); }}
            autoCapitalize="none"
            autoCorrect={false}
            multiline
            editable={!busy}
            testID="cadre-seed-input"
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
              testID="cadre-seed-apply"
            >
              <Text style={styles.btnPrimaryText}>{busy ? 'Connecting…' : 'Connect'}</Text>
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
