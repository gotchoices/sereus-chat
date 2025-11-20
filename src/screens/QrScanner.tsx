import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Platform } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useT } from '../i18n';
import { Camera, useCameraDevice, useCodeScanner } from 'react-native-vision-camera';

export default function QrScanner() {
  const t = useT();
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

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('screens.QrScanner.title')}</Text>
      {permission === 'authorized' && device && !isSimulator ? (
        <View style={styles.cameraWrap}>
          <Camera
            style={styles.camera}
            device={device}
            isActive={true}
            codeScanner={codeScanner}
          />
          <View style={styles.overlay} pointerEvents="none" />
        </View>
      ) : (
        <View style={styles.preview} accessibilityLabel="Camera preview placeholder">
          <Ionicons name="scan-outline" size={48} color="#888" />
          <Text style={styles.previewText}>{t('screens.QrScanner.simulatorNote')}</Text>
        </View>
      )}
      <Text style={styles.label}>{t('screens.QrScanner.pasteLabel')}</Text>
      <TextInput
        style={styles.input}
        placeholder={t('screens.QrScanner.pastePlaceholder')}
        value={value}
        onChangeText={setValue}
        autoCapitalize="none"
        autoCorrect={false}
        testID="qr-paste-input"
      />
      <TouchableOpacity
        style={[styles.openBtn, !valid && styles.openBtnDisabled]}
        disabled={!valid}
        onPress={() => {
          // In future: navigate to InvitationAcceptance with parsed token
        }}
        accessibilityLabel="Open invite"
        testID="qr-open"
      >
        <Text style={styles.openText}>{t('screens.QrScanner.open')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 20 },
  title: { fontSize: 18, fontWeight: '600', marginBottom: 12 },
  cameraWrap: {
    height: 260,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 16,
  },
  camera: { flex: 1 },
  overlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    borderColor: 'rgba(255,255,255,0.6)',
    borderWidth: 2,
    borderStyle: 'dashed',
  },
  preview: {
    height: 220,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#cccccc',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    backgroundColor: '#fafafa',
  },
  previewText: { color: '#777', marginTop: 8 },
  label: { color: '#666', marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  openBtn: {
    alignSelf: 'flex-start',
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: '#0066cc',
    borderRadius: 6,
  },
  openBtnDisabled: {
    backgroundColor: '#9bbfe6',
  },
  openText: { color: '#fff', fontWeight: '600' },
});


