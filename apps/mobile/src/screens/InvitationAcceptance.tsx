import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useT } from '../i18n';
import { useTheme, typography, spacing, radius } from '../theme';

export default function InvitationAcceptance() {
  const route: any = useRoute();
  const navigation: any = useNavigation();
  const t = useT();
  const theme = useTheme();

  // token from path param via linking config invite/:token
  const token: string = route?.params?.token || '';

  const summary = useMemo(() => {
    return t('screens.InvitationAcceptance.summary', 'Accept invitation to connect and start a strand.');
  }, [t]);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.card, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}>
        <Text style={[styles.label, { color: theme.textSecondary }]}>
          {t('screens.InvitationAcceptance.token', 'Token')}
        </Text>
        <Text selectable style={[styles.token, { color: theme.textPrimary }]} testID="invite-token">{token}</Text>
        <Text style={[styles.summary, { color: theme.textSecondary }]}>{summary}</Text>
        <View style={styles.row}>
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border }]}
            onPress={() => navigation.navigate('ConnectionsList')}
            accessibilityLabel={t('screens.InvitationAcceptance.cancel', 'Cancel')}
            testID="accept-cancel"
          >
            <Text style={[styles.btnText, { color: theme.textPrimary }]}>{t('screens.InvitationAcceptance.cancel', 'Cancel')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: theme.accent }]}
            onPress={() => {
              // In a real app, call acceptInvitation(token); for now, go home.
              navigation.navigate('ConnectionsList');
            }}
            accessibilityLabel={t('screens.InvitationAcceptance.join', 'Join')}
            testID="accept-join"
          >
            <Text style={[styles.btnText, { color: theme.accentText }]}>{t('screens.InvitationAcceptance.join', 'Join')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: spacing[4] },
  card: { borderWidth: 1, borderRadius: radius.card, padding: spacing[3] },
  label: { ...typography.small, marginBottom: spacing[0] },
  token: { ...typography.body, marginBottom: spacing[2] },
  summary: { ...typography.body, marginBottom: spacing[3] },
  row: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing[2] },
  btn: { paddingVertical: spacing[2], paddingHorizontal: spacing[3], borderRadius: radius.control },
  btnText: { ...typography.body, fontWeight: '600' },
});
