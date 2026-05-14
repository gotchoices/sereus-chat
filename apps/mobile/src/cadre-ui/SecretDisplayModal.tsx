/**
 * SecretDisplayModal — generic modal for showing a base64url payload
 * the user is meant to copy for out-of-band transport.
 *
 * Used for both drone seeds (transport to cadre-cli) and authority private
 * key backup (offline recovery).  Title/hint are caller-supplied so the
 * security framing fits the use case.
 */

import React, { useMemo } from 'react';
import {
  Alert,
  Clipboard,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useCadreTheme, type CadreManagerTheme } from './theme';

interface Props {
  visible: boolean;
  /** Modal title, e.g. "Drone seed" or "Recovery key". */
  title: string;
  /** Explanation text shown above the secret. */
  hint: string;
  /** The secret to display.  Null = "Generating…" placeholder. */
  value: string | null;
  /** Optional error to render in place of the secret. */
  error: string | null;
  /** Optional emphasis stripe colour — pass theme.danger for sensitive data. */
  emphasis?: 'normal' | 'sensitive';
  onClose: () => void;
}

export default function SecretDisplayModal({
  visible,
  title,
  hint,
  value,
  error,
  emphasis = 'normal',
  onClose,
}: Props) {
  const theme = useCadreTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const onCopy = () => {
    if (value) {
      Clipboard.setString(value);
      Alert.alert('Copied');
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          {emphasis === 'sensitive' && <View style={styles.sensitiveStripe} />}
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={22} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>
          {error ? (
            <Text style={styles.error}>{error}</Text>
          ) : (
            <>
              <Text style={styles.hint}>{hint}</Text>
              <ScrollView style={styles.box} contentContainerStyle={{ padding: 12 }}>
                <Text selectable style={styles.boxText}>
                  {value ?? 'Generating…'}
                </Text>
              </ScrollView>
              <View style={styles.actions}>
                <TouchableOpacity style={styles.btnSecondary} onPress={onClose}>
                  <Text style={styles.btnSecondaryText}>Done</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.btnPrimary, !value && { opacity: 0.5 }]}
                  onPress={onCopy}
                  disabled={!value}
                >
                  <Ionicons name="copy-outline" size={16} color={theme.accentText} />
                  <Text style={styles.btnPrimaryText}>Copy</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
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
      overflow: 'hidden',
    },
    sensitiveStripe: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      width: 4,
      backgroundColor: theme.danger,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    title: { fontSize: 17, fontWeight: '700', color: theme.textPrimary },
    hint: { fontSize: 13, color: theme.textSecondary, marginBottom: 10 },
    box: {
      maxHeight: 220,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 8,
      backgroundColor: theme.background,
      marginBottom: 12,
    },
    boxText: { fontSize: 12, fontFamily: 'monospace', color: theme.textPrimary },
    actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
    btnPrimary: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.accent,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 8,
      gap: 6,
    },
    btnPrimaryText: { color: theme.accentText, fontWeight: '600' },
    btnSecondary: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 8,
    },
    btnSecondaryText: { color: theme.accent, fontWeight: '600' },
    error: { color: theme.danger, marginBottom: 8 },
  });
}
