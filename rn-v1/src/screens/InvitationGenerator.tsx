import React, { useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Share, Switch, Platform, ToastAndroid } from 'react-native';
import { useVariant } from '../mock/VariantContext';
import { useT } from '../i18n';
import Clipboard from '@react-native-clipboard/clipboard';
import QRCode from 'react-native-qrcode-svg';
import Ionicons from 'react-native-vector-icons/Ionicons';

export default function InvitationGenerator() {
  const t = useT();
  const { variant, mockMode } = useVariant();
  const [includeQR, setIncludeQR] = useState(true);
  const qrRef = useRef<QRCode | null>(null);
  const inviteLink = useMemo(() => {
    const token = Math.random().toString(36).slice(2, 10);
    const v = mockMode && variant ? `?variant=${encodeURIComponent(variant)}` : '';
    return `chat://invite/${token}${v}`;
  }, [variant, mockMode]);

  const onShare = async () => {
    try {
      if (includeQR && qrRef.current && Platform.OS === 'ios') {
        // iOS Share can use URL; base64 image sharing is limited – include link + note
        await Share.share({
          message: `${t('screens.InvitationGenerator.sharePrefix')}: ${inviteLink}\n(${t('screens.InvitationGenerator.scanQRIfVisible')})`,
          url: undefined,
        });
      } else {
        await Share.share({
          message: `${t('screens.InvitationGenerator.sharePrefix')}: ${inviteLink}`,
        });
      }
    } catch {}
  };

  const [toastVisible, setToastVisible] = useState(false);
  const onCopy = () => {
    Clipboard.setString(inviteLink);
    if (Platform.OS === 'android') {
      ToastAndroid.show(t('screens.InvitationGenerator.toastCopied'), ToastAndroid.SHORT);
    } else {
      setToastVisible(true);
      setTimeout(() => setToastVisible(false), 1200);
    }
  };
  const shareIcon = Platform.select({ ios: 'share-outline', android: 'share-social-outline', default: 'share-outline' }) as string;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('screens.InvitationGenerator.title')}</Text>
      <View style={styles.card}>
        <Text style={styles.label}>{t('screens.InvitationGenerator.labelLink')}</Text>
        <View style={styles.linkRow}>
          <Text selectable style={styles.link} numberOfLines={1} ellipsizeMode="middle" testID="invite-link">{inviteLink}</Text>
          <TouchableOpacity onPress={onCopy} accessibilityLabel="Copy link" testID="invite-copy" style={styles.copyBtn}>
            <Ionicons name="copy-outline" size={18} color="#0066cc" />
          </TouchableOpacity>
        </View>
        <View style={styles.toggleRow}>
          <Switch value={includeQR} onValueChange={setIncludeQR} />
          <Text style={styles.toggleLabel}>{t('screens.InvitationGenerator.includeQR')}</Text>
        </View>
        {includeQR && (
          <View style={styles.qrBox} accessible accessibilityLabel="Invitation QR code">
            <QRCode
              value={inviteLink}
              size={200}
              backgroundColor="#ffffff"
              color="#000000"
              getRef={(c) => (qrRef.current = c)}
            />
          </View>
        )}
        <TouchableOpacity style={styles.shareBtn} onPress={onShare} accessibilityLabel="Share invite" testID="invite-share">
          <Ionicons name={shareIcon} size={20} color="#fff" />
        </TouchableOpacity>
      </View>
      {toastVisible && (
        <View style={styles.toast} accessibilityLabel="Toast">
          <Text style={styles.toastText}>{t('screens.InvitationGenerator.toastCopied')}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 20 },
  title: { fontSize: 18, fontWeight: '600', marginBottom: 12 },
  card: { borderWidth: 1, borderColor: '#eee', borderRadius: 12, padding: 16 },
  label: { color: '#666', marginBottom: 6 },
  linkRow: { flexDirection: 'row', alignItems: 'center' },
  link: { flex: 1, fontSize: 14, color: '#0066cc' },
  copyBtn: { marginLeft: 8, padding: 6 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12, marginBottom: 8 },
  toggleLabel: { marginLeft: 8 },
  qrBox: { alignItems: 'center', marginTop: 8, marginBottom: 8 },
  shareBtn: { alignSelf: 'flex-start', marginTop: 12, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: '#0066cc', borderRadius: 6 },
  toast: {
    position: 'absolute',
    bottom: 24,
    left: 20,
    right: 20,
    alignItems: 'center',
  },
  toastText: {
    backgroundColor: 'rgba(0,0,0,0.8)',
    color: '#fff',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    overflow: 'hidden',
  }
});


