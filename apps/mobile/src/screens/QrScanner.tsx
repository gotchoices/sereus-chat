import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Platform } from 'react-native';
import { useT } from '../i18n';
import { Camera, useCameraDevice, useCodeScanner } from 'react-native-vision-camera';
import { EmptyState } from '../components';
import { useTheme, typography, spacing, radius } from '../theme';

export default function QrScanner() {
  const t = useT();
  const theme = useTheme();
  const [value, setValue] = useState('');
  const [permission, setPermission] = useState<'authorized' | 'denied' | 'not-determined'>('not-determined');
  const device = useCameraDevice('back');
  const isSimulator = Platform.OS === 'ios' ? !Platform.constants?.isDevice : false;
  const handledRef = useRef<string | null>(null);
  const codeScanner = useCodeScanner({
    codeTypes: ['qr'],
    onCodeScanned: (codes) => {
      if (!codes?.length) return;
      const first = codes[0];
      const value = (first as any)?.value ?? (first as any)?.displayValue ?? '';
      if (!value) return;
      if (handledRef.current === value) return;
      handledRef.current = value;
      setValue(value);
    },
  });

  useEffect(() => {
    let mounted = true;
    (async () => {
      const status = await Camera.requestCameraPermission();
      if (mounted) setPermission(status);
    })();
    return () => { mounted = false; };
  }, []);

  const valid = useMemo(() => {
    if (!value) return false;
    return /^sereus:\/\/invite\/[A-Za-z0-9_-]+(\?.*)?$/.test(value.trim());
  }, [value]);

  const cameraReady = permission === 'authorized' && device && !isSimulator;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Text style={[styles.title, { color: theme.textPrimary }]}>{t('screens.QrScanner.title')}</Text>
      {cameraReady ? (
        <View style={styles.cameraWrap}>
          <Camera
            style={styles.camera}
            device={device}
            isActive={true}
            codeScanner={codeScanner}
          />
          <View style={[styles.overlay, { borderColor: theme.overlay }]} pointerEvents="none" />
        </View>
      ) : (
        <View
          style={[styles.preview, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}
          accessibilityLabel="Camera preview placeholder"
        >
          <EmptyState
            icon="camera-outline"
            title={t('screens.QrScanner.cameraUnavailable', 'Camera unavailable')}
            hint={t('screens.QrScanner.simulatorNote')}
          />
        </View>
      )}
      <Text style={[styles.label, { color: theme.textSecondary }]}>{t('screens.QrScanner.pasteLabel')}</Text>
      <TextInput
        style={[styles.input, { backgroundColor: theme.surfaceAlt, borderColor: theme.border, color: theme.textPrimary }]}
        placeholder={t('screens.QrScanner.pastePlaceholder')}
        placeholderTextColor={theme.textMuted}
        value={value}
        onChangeText={setValue}
        autoCapitalize="none"
        autoCorrect={false}
        testID="qr-paste-input"
      />
      <TouchableOpacity
        style={[styles.openBtn, { backgroundColor: theme.accent }, !valid && styles.openBtnDisabled]}
        disabled={!valid}
        onPress={() => {
          // In future: navigate to InvitationAcceptance with parsed token
        }}
        accessibilityLabel="Open invite"
        testID="qr-open"
      >
        <Text style={[styles.openText, { color: theme.accentText }]}>{t('screens.QrScanner.open')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: spacing[4] },
  title: { ...typography.title, marginBottom: spacing[2] },
  cameraWrap: {
    height: 260,
    borderRadius: radius.card,
    overflow: 'hidden',
    marginBottom: spacing[3],
  },
  camera: { flex: 1 },
  overlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    borderWidth: 2,
    borderStyle: 'dashed',
  },
  preview: {
    height: 220,
    borderRadius: radius.card,
    borderWidth: 1,
    borderStyle: 'dashed',
    justifyContent: 'center',
    marginBottom: spacing[3],
  },
  label: { ...typography.small, marginBottom: spacing[1] },
  input: {
    borderWidth: 1,
    borderRadius: radius.control,
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[2],
    ...typography.body,
  },
  openBtn: {
    alignSelf: 'flex-start',
    marginTop: spacing[2],
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[3],
    borderRadius: radius.control,
  },
  openBtnDisabled: {
    opacity: 0.5,
  },
  openText: { ...typography.body, fontWeight: '600' },
});
