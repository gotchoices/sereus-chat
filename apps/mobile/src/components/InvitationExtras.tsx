/**
 * InvitationExtras — what the invitation screen shows beside a minted invitation:
 *   - whether it is ready to hand out (a machine of the person's own can answer it while this
 *     phone sleeps), live;
 *   - "What's in this invitation": the addresses it tells the other person to connect to, in
 *     words, with the link's size;
 *   - the QR code, which a tap opens full screen at the largest size the screen allows.
 *
 * All of it comes from the model's `cadrons` (`@chat/cadre-client`'s invitations model).
 */
import React, { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { invitationReadinessStore, type InvitationText } from '@chat/cadre-client';
import type { Invitation } from '@chat/core';
import { useModel } from '../data/bind';
import { useT } from '../i18n';
import { useTheme, typography, spacing, radius } from '../theme';

/** Readiness, live, for a minted invitation. */
export function InvitationReadiness({ invitation }: { invitation: Invitation }) {
  const model = useModel();
  const theme = useTheme();
  const t = useT();
  const store = useMemo(() => invitation.strandId
    ? invitationReadinessStore({ invitations: model.cadrons, changes: { invitations: model.changes.cadrons } },
      invitation.strandId, { newStrand: invitation.newStrand === true })
    : null, [model, invitation.strandId, invitation.newStrand]);
  const noop = () => () => {};
  const readiness = useSyncExternalStore(store?.subscribe ?? noop, () => store?.get() ?? null, () => store?.get() ?? null);
  if (!readiness) return null;
  const [icon, color, text] = readiness === 'ready'
    ? ['checkmark-circle', theme.success, t('invite.readyYes')]
    : readiness === 'waiting'
      ? ['time-outline', theme.textMuted, t('invite.readyWaiting')]
      : ['alert-circle-outline', theme.textMuted, t('invite.readyNoCadron')];
  return (
    <View style={styles.row} testID={`invite-readiness-${readiness}`}>
      <Ionicons name={icon} size={18} color={color} />
      <Text style={[typography.small, styles.grow, { color: theme.textPrimary }]}>{text}</Text>
    </View>
  );
}

/** "What's in this invitation": revealed on request. */
export function InvitationDetails({ invitation }: { invitation: Invitation }) {
  const model = useModel();
  const theme = useTheme();
  const t = useT();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState<InvitationText | null>(null);
  useEffect(() => {
    if (!open) return;
    let live = true;
    void model.cadrons.describe(invitation.token, invitation.qrPayload).then(r => { if (live && r.ok) setText(r.value); });
    return () => { live = false; };
  }, [open, model, invitation.token, invitation.qrPayload]);

  return (
    <View>
      <Pressable onPress={() => setOpen(o => !o)} style={styles.row} accessibilityRole="button" testID="invite-details-toggle">
        <Ionicons name={open ? 'chevron-down' : 'chevron-forward'} size={16} color={theme.accent} />
        <Text style={[typography.small, { color: theme.accent }]}>{open ? t('invite.detailsHide') : t('invite.details')}</Text>
      </Pressable>
      {open && text ? (
        <View style={[styles.details, { borderColor: theme.border }]} testID="invite-details">
          <Text style={[typography.small, { color: theme.textSecondary }]}>{t('invite.detailsAddrs')}</Text>
          {text.addresses.map(a => (
            <View key={a.addr} style={styles.addr}>
              <Ionicons name={a.thisDevice ? 'phone-portrait-outline' : 'server-outline'} size={16}
                color={a.reachesAnywhere ? theme.textPrimary : theme.textMuted} />
              <View style={styles.grow}>
                <Text style={[typography.small, { color: theme.textPrimary }]}>
                  {(a.thisDevice ? t('invite.detailsThisDevice') : a.label) + ' · ' + t(`invite.detailsKind_${a.kind ?? 'none'}` as never)}
                </Text>
                <Text style={[typography.small, { color: theme.textMuted }]} selectable>
                  {a.via === 'relay'
                    ? t('invite.detailsRelay').replace('{{host}}', a.host)
                    : t('invite.detailsDirect').replace('{{host}}', a.host).replace('{{port}}', String(a.port ?? '?'))}
                </Text>
              </View>
            </View>
          ))}
          <Text style={[typography.small, { color: theme.textMuted, marginTop: spacing[1] }]}>
            {t('invite.detailsExpires').replace('{{when}}', new Date(text.expiresAt).toLocaleString())}
          </Text>
          <Text style={[typography.small, { color: theme.textMuted }]}>
            {(text.qrVersion ? t('invite.detailsSize').replace('{{version}}', String(text.qrVersion)) : t('invite.detailsSizeTooBig'))
              .replace('{{chars}}', String(text.linkLength))}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/** The QR code at its usual size; a tap opens it full screen, dark on white for any scanner. */
export function InvitationQr({ value, size = 180 }: { value: string; size?: number }) {
  const theme = useTheme();
  const t = useT();
  const { width, height } = useWindowDimensions();
  const [full, setFull] = useState(false);
  const big = Math.floor(Math.min(width, height) * 0.9);
  return (
    <>
      <Pressable onPress={() => setFull(true)} accessibilityRole="imagebutton" accessibilityLabel={t('invite.qrTapToEnlarge')}
        style={styles.qrSmall} testID="invite-qr">
        <QRCode value={value} size={size} backgroundColor={theme.surfaceAlt} color={theme.textPrimary} />
        <Text style={[typography.small, { color: theme.textMuted, marginTop: spacing[1] }]}>{t('invite.qrTapToEnlarge')}</Text>
      </Pressable>
      <Modal visible={full} animationType="fade" onRequestClose={() => setFull(false)} supportedOrientations={['portrait', 'landscape']}>
        <Pressable style={styles.qrFull} onPress={() => setFull(false)} accessibilityLabel={t('invite.qrClose')} testID="invite-qr-full">
          <QRCode value={value} size={big} backgroundColor="#ffffff" color="#000000" />
          <Text style={[typography.small, { color: '#555555', marginTop: spacing[3] }]}>{t('invite.qrClose')}</Text>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], paddingVertical: spacing[1] },
  grow: { flex: 1 },
  details: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing[2], gap: spacing[1], borderRadius: radius.control },
  addr: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[2], paddingVertical: 2 },
  qrSmall: { alignItems: 'center', paddingVertical: spacing[2] },
  qrFull: { flex: 1, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center' },
});
