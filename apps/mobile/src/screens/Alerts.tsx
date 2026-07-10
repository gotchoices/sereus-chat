import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useT } from '../i18n';
import { EmptyState } from '../components';
import { useTheme } from '../theme';

export default function Alerts() {
  const t = useT();
  const theme = useTheme();
  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <EmptyState
        icon="notifications-outline"
        title={t('screens.alerts.emptyTitle', 'No alerts')}
        hint={t('screens.alerts.emptyHint', 'Invitations and notifications will show up here.')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
