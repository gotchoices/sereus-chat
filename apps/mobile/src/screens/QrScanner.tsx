import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useT } from '../i18n';
import { Camera, useCameraDevice, useCodeScanner } from 'react-native-vision-camera';
import { EmptyState } from '../components';
import { parseInviteToken } from '../data/inviteLink';
import { useTheme, typography, spacing, radius } from '../theme';

export default function QrScanner() {
  const t = useT();
  const theme = useTheme();
  const navigation: any = useNavigation();
  const [value, setValue] = useState('');
  const [permission, setPermission] = useState<'authorized' | 'denied' | 'not-determined'>('not-determined');
  const device = useCameraDevice('back');
  const isSimulator = Platform.OS === 'ios' ? !(Platform.constants as any)?.isDevice : false;
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
      // vision-camera reports 'granted'; our state uses the older wording.
      const mapped = status === 'granted' ? 'authorized' : status === 'denied' ? 'denied' : 'not-determined';
      if (mounted) setPermission(mapped as 'authorized' | 'denied' | 'not-determined');
    })();
    return () => { mounted = false; };
  }, []);

  // Accepts both the https App Link and the chat:// fallback (inviteLink.ts).
  const token = useMemo(() => parseInviteToken(value), [value]);
  const valid = token !== null;

  const cameraReady = permission === 'authorized' && device && !isSimulator;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Text style={[styles.title, { color: theme.textPrimary }]}>{t('screens.QrScanner.title', 'Scan QR')}</Text>
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
            hint={t('screens.QrScanner.simulatorNote', 'Camera not available in simulator. Paste an invite link below.')}
          />
        </View>
      )}
      <Text style={[styles.label, { color: theme.textSecondary }]}>{t('screens.QrScanner.pasteLabel', 'Paste invite link')}</Text>
      <TextInput
        style={[styles.input, { backgroundColor: theme.surfaceAlt, borderColor: theme.border, color: theme.textPrimary }]}
        placeholder={t('screens.QrScanner.pastePlaceholder', 'sereus://invite/abc123?variant=happy')}
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
          if (token) navigation.navigate('InvitationAcceptance', { token });
        }}
        accessibilityLabel="Open invite"
        testID="qr-open"
      >
        <Text style={[styles.openText, { color: theme.accentText }]}>{t('screens.QrScanner.open', 'Open')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: spacing[4] },
  title: { ...typography.title, marginBottom: spacing[2] },
  cameraWrap: {
    height: 260,
    marginBottom: spacing[3],
    // CLIPPED BUT NOT ROUNDED. vision-camera's preview is a native surface, and
    // clipping one to a ROUNDED parent makes Android composite it away on a number
    // of devices: the camera runs and frames are produced while the app shows a
    // blank rectangle. A Galaxy S7 did exactly that — `mm-camera-CORE` processing
    // frames while `CameraView` reported 0 fps to the view. Plain `overflow`
    // still keeps the preview inside its box; only `borderRadius` has to go.
    //
    // CORRECTION, measured on the S7 (Android 8): plain `overflow: 'hidden'` blanks
    // it too — ANY clip of this surface does, not just a rounded one. And
    // `resizeMode="contain"` is not the way out: it makes the session fail with
    // `session/invalid-output-configuration` and renders black. So the preview is
    // left unclipped at its natural size, which can overflow this box slightly.
    // That is deliberate and is the only combination measured to actually show a
    // picture on that device. Do not reintroduce `overflow` or `resizeMode` without
    // re-testing on a real phone; the emulator does not reproduce this.
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
