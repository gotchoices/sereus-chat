import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Share, Switch, Platform, ToastAndroid } from 'react-native';
import { useT } from '../i18n';
import { createInvitation } from '../data/adapter';
import { buildInviteUrl } from '../data/inviteLink';
import type { Invitation } from '../data/types';
import Clipboard from '@react-native-clipboard/clipboard';
import QRCode from 'react-native-qrcode-svg';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { Banner, IconButton } from '../components';
import { useTheme, typography, spacing, radius } from '../theme';

export default function InvitationGenerator() {
  const t = useT();
  const theme = useTheme();
  const [includeQR, setIncludeQR] = useState(true);
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const qrRef = useRef<QRCode | null>(null);

  // Minting an invitation talks to the live cadre and can legitimately fail —
  // e.g. `createOpenInvitation` throws "No multiaddrs available for
  // invitation" until this device has a dialable address (it needs a node in
  // its cadre to relay through).  Never let that surface as an unhandled
  // rejection with the UI stuck on "Generating...".
  const generate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const inv = await createInvitation();
      setInvitation(inv);
    } catch (err) {
      setInvitation(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void generate();
  }, [generate]);

  // Shareable App Link / Universal Link (see src/data/inviteLink.ts).
  const inviteLink = useMemo(() => {
    if (!invitation) return '';
    return buildInviteUrl(invitation.token);
  }, [invitation]);

  const onRegenerate = generate;

  const onShare = async () => {
    if (!inviteLink) return;
    try {
      if (includeQR && qrRef.current && Platform.OS === 'ios') {
        await Share.share({
          message: `${t('screens.InvitationGenerator.sharePrefix', 'Join me on Sereus Chat')}: ${inviteLink}\n(${t('screens.InvitationGenerator.scanQRIfVisible', 'Scan QR if visible')})`,
          url: undefined,
        });
      } else {
        await Share.share({
          message: `${t('screens.InvitationGenerator.sharePrefix', 'Join me on Sereus Chat')}: ${inviteLink}`,
        });
      }
    } catch {}
  };

  const [toastVisible, setToastVisible] = useState(false);
  const onCopy = () => {
    if (!inviteLink) return;
    Clipboard.setString(inviteLink);
    if (Platform.OS === 'android') {
      ToastAndroid.show(t('screens.InvitationGenerator.toastCopied', 'Copied'), ToastAndroid.SHORT);
    } else {
      setToastVisible(true);
      setTimeout(() => setToastVisible(false), 1200);
    }
  };
  const shareIcon = Platform.select({ ios: 'share-outline', android: 'share-social-outline', default: 'share-outline' }) as string;

  if (error) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <Text style={[styles.title, { color: theme.textPrimary }]}>{t('screens.InvitationGenerator.title', 'Invite Friends')}</Text>
        <View style={[styles.card, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}>
          <Text style={[styles.errorTitle, { color: theme.textPrimary }]} testID="invite-error-title">
            {t('screens.InvitationGenerator.errorTitle', "Can't create an invitation yet")}
          </Text>
          <Banner
            testID="invite-error"
            variant="error"
            message={error}
            action={{ label: t('screens.InvitationGenerator.retry', 'Try again'), onPress: onRegenerate, testID: 'invite-retry' }}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Text style={[styles.title, { color: theme.textPrimary }]}>{t('screens.InvitationGenerator.title', 'Invite Friends')}</Text>
      <View style={[styles.card, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>{t('screens.InvitationGenerator.labelLink', 'Invitation Link')}</Text>
        <View style={[styles.linkRow, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text selectable style={[styles.link, { color: theme.textPrimary }]} numberOfLines={1} ellipsizeMode="middle" testID="invite-link">
            {inviteLink || (loading ? t('screens.InvitationGenerator.generating', 'Generating...') : '')}
          </Text>
          <IconButton
            name="copy-outline"
            size={20}
            onPress={onCopy}
            disabled={!inviteLink}
            accessibilityLabel="Copy link"
            testID="invite-copy"
          />
        </View>
        <View style={styles.toggleRow}>
          <Switch
            value={includeQR}
            onValueChange={setIncludeQR}
            trackColor={{ true: theme.accent, false: theme.border }}
          />
          <Text style={[styles.toggleLabel, { color: theme.textPrimary }]}>{t('screens.InvitationGenerator.includeQR', 'Include QR')}</Text>
        </View>
        {includeQR && inviteLink ? (
          <View style={[styles.qrBox, { backgroundColor: theme.surface, borderColor: theme.border }]} accessible accessibilityLabel="Invitation QR code">
            <QRCode
              value={inviteLink}
              size={200}
              backgroundColor="#ffffff"
              color="#000000"
              getRef={(c) => (qrRef.current = c)}
            />
          </View>
        ) : null}
        <View style={styles.btnRow}>
          <IconButton
            name={shareIcon}
            size={20}
            variant="accent"
            onPress={onShare}
            accessibilityLabel="Share invite"
            testID="invite-share"
          />
          <TouchableOpacity
            style={[styles.regenBtn, { backgroundColor: theme.surface, borderColor: theme.border }]}
            onPress={onRegenerate}
            accessibilityLabel="Regenerate"
            testID="invite-regen"
          >
            <Ionicons name="refresh-outline" size={18} color={theme.textPrimary} />
            <Text style={[styles.regenText, { color: theme.textPrimary }]}>{t('screens.InvitationGenerator.regenerate', 'Regenerate')}</Text>
          </TouchableOpacity>
        </View>
      </View>
      {toastVisible && (
        <View style={styles.toast} accessibilityLabel="Toast">
          <Text style={[styles.toastText, { backgroundColor: theme.surfaceAlt, borderColor: theme.border, color: theme.textPrimary }]}>
            {t('screens.InvitationGenerator.toastCopied', 'Copied')}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: spacing[4] },
  title: { ...typography.title, marginBottom: spacing[2] },
  card: { borderWidth: 1, borderRadius: radius.card, padding: spacing[3] },
  label: { ...typography.small, marginBottom: spacing[1] },
  errorTitle: { ...typography.body, fontWeight: '600', marginBottom: spacing[2] },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.control,
    paddingLeft: spacing[2],
  },
  link: { ...typography.body, flex: 1 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing[2], marginBottom: spacing[1] },
  toggleLabel: { ...typography.body, marginLeft: spacing[1] },
  qrBox: {
    alignItems: 'center',
    alignSelf: 'center',
    marginTop: spacing[1],
    marginBottom: spacing[1],
    padding: spacing[2],
    borderWidth: 1,
    borderRadius: radius.card,
  },
  btnRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing[2], gap: spacing[2] },
  regenBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing[1],
    paddingHorizontal: spacing[2],
    borderWidth: 1,
    borderRadius: radius.control,
  },
  regenText: { ...typography.body, marginLeft: spacing[0] },
  toast: {
    position: 'absolute',
    bottom: spacing[5],
    left: spacing[4],
    right: spacing[4],
    alignItems: 'center',
  },
  toastText: {
    ...typography.body,
    borderWidth: 1,
    paddingVertical: spacing[1],
    paddingHorizontal: spacing[2],
    borderRadius: radius.control,
    overflow: 'hidden',
  },
});
