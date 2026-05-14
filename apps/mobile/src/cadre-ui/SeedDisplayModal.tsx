/**
 * SeedDisplayModal — shows an encoded cadre seed for out-of-band transport.
 *
 * The seed is a base64url string the user pastes into a `cadre-cli` instance
 * (drone) to authorize that node into the cadre.  Until QR/deep-link delivery
 * lands, copy/paste is the transport.
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
  seed: string | null;
  error: string | null;
  onClose: () => void;
}

export default function SeedDisplayModal({ visible, seed, error, onClose }: Props) {
  const theme = useCadreTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const onCopy = () => {
    if (seed) {
      Clipboard.setString(seed);
      Alert.alert('Copied');
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>Drone seed</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={22} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>
          {error ? (
            <Text style={styles.error}>{error}</Text>
          ) : (
            <>
              <Text style={styles.hint}>
                Paste this into your cadre-cli drone to authorize it for your cadre.
                Generated seeds expire and should be transported privately.
              </Text>
              <ScrollView style={styles.seedBox} contentContainerStyle={{ padding: 12 }}>
                <Text selectable style={styles.seedText}>
                  {seed ?? 'Generating…'}
                </Text>
              </ScrollView>
              <View style={styles.actions}>
                <TouchableOpacity style={styles.btnSecondary} onPress={onClose}>
                  <Text style={styles.btnSecondaryText}>Done</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.btnPrimary, !seed && { opacity: 0.5 }]}
                  onPress={onCopy}
                  disabled={!seed}
                >
                  <Ionicons name="copy-outline" size={16} color={theme.accentText} />
                  <Text style={styles.btnPrimaryText}>Copy seed</Text>
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
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    title: { fontSize: 17, fontWeight: '700', color: theme.textPrimary },
    hint: { fontSize: 13, color: theme.textSecondary, marginBottom: 10 },
    seedBox: {
      maxHeight: 220,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 8,
      backgroundColor: theme.background,
      marginBottom: 12,
    },
    seedText: { fontSize: 12, fontFamily: 'monospace', color: theme.textPrimary },
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
