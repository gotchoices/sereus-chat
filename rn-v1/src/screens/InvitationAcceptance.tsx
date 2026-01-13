import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useT } from '../i18n';
import { useVariant } from '../mock/VariantContext';

export default function InvitationAcceptance() {
  const route: any = useRoute();
  const navigation: any = useNavigation();
  const t = useT();
  const { mockMode } = useVariant();

  // token from path param via linking config invite/:token
  const token: string = route?.params?.token || '';

  // We could also parse variant from query if present, but VariantContext already handles it globally
  const summary = useMemo(() => {
    return t('screens.InvitationAcceptance.summary', 'Accept invitation to connect and start a strand.');
  }, [t]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('screens.InvitationAcceptance.title', 'Accept Invitation')}</Text>
      <View style={styles.card}>
        <Text style={styles.label}>{t('screens.InvitationAcceptance.token', 'Token')}</Text>
        <Text selectable style={styles.token} testID="invite-token">{token}</Text>
        <Text style={styles.summary}>{summary}</Text>
        <View style={styles.row}>
          <TouchableOpacity
            style={[styles.btn, styles.secondary]}
            onPress={() => navigation.navigate('ConnectionsList')}
            accessibilityLabel={t('screens.InvitationAcceptance.cancel', 'Cancel')}
            testID="accept-cancel"
          >
            <Text style={[styles.btnText, styles.secondaryText]}>{t('screens.InvitationAcceptance.cancel', 'Cancel')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, styles.primary]}
            onPress={() => {
              // In a real app, call engine.acceptInvite(token); for now, go to home.
              navigation.navigate('ConnectionsList');
            }}
            accessibilityLabel={t('screens.InvitationAcceptance.join', 'Join')}
            testID="accept-join"
          >
            <Text style={styles.btnText}>{t('screens.InvitationAcceptance.join', 'Join')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 20 },
  title: { fontSize: 18, fontWeight: '600', marginBottom: 12 },
  card: { borderWidth: 1, borderColor: '#eee', borderRadius: 12, padding: 16 },
  label: { color: '#666', marginBottom: 6 },
  token: { fontSize: 14, color: '#333', marginBottom: 8 },
  summary: { color: '#444', marginBottom: 12 },
  row: { flexDirection: 'row', justifyContent: 'flex-end' },
  btn: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 6, marginLeft: 10 },
  primary: { backgroundColor: '#0066cc' },
  secondary: { backgroundColor: '#eef3f8' },
  btnText: { color: '#fff', fontWeight: '600' },
  secondaryText: { color: '#0066cc' },
});


