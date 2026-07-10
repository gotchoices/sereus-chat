/**
 * MessageBubble — one chat message.
 *
 * ui.md: outgoing = accent / accentText; incoming = surfaceAlt / textPrimary;
 * radius 16; max width ~80%.  Optional sender name (group strands), delivery
 * status tick, and attachment preview slot.
 */

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useTheme, typography, spacing, radius } from '../theme';

export interface MessageBubbleProps {
  text: string;
  outgoing?: boolean;
  senderName?: string | null;
  timestamp?: string | null;
  status?: 'sent' | 'delivered' | 'read';
  attachment?: React.ReactNode;
  onLongPress?: () => void;
  testID?: string;
  accessibilityLabel?: string;
}

function statusIcon(status?: MessageBubbleProps['status']): string | null {
  switch (status) {
    case 'sent':
      return 'checkmark-outline';
    case 'delivered':
      return 'checkmark-done-outline';
    case 'read':
      return 'checkmark-done';
    default:
      return null;
  }
}

export function MessageBubble({
  text,
  outgoing = false,
  senderName,
  timestamp,
  status,
  attachment,
  onLongPress,
  testID,
  accessibilityLabel,
}: MessageBubbleProps) {
  const theme = useTheme();
  const bg = outgoing ? theme.accent : theme.surfaceAlt;
  const fg = outgoing ? theme.accentText : theme.textPrimary;
  const meta = outgoing ? theme.accentText : theme.textMuted;
  const tick = statusIcon(status);

  return (
    <Pressable
      testID={testID}
      accessible
      accessibilityLabel={accessibilityLabel}
      onLongPress={onLongPress}
      style={[
        styles.wrap,
        outgoing ? styles.wrapOut : styles.wrapIn,
        { backgroundColor: bg },
      ]}
    >
      {senderName && !outgoing ? (
        <Text style={[styles.sender, { color: theme.accent }]} numberOfLines={1}>
          {senderName}
        </Text>
      ) : null}
      {attachment ? <View style={styles.attachment}>{attachment}</View> : null}
      {text ? <Text style={[styles.text, { color: fg }]}>{text}</Text> : null}
      <View style={styles.metaRow}>
        {timestamp ? <Text style={[styles.meta, { color: meta }]}>{timestamp}</Text> : null}
        {outgoing && tick ? <Ionicons name={tick} size={14} color={meta} style={styles.tick} /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    maxWidth: '80%',
    paddingVertical: spacing[1],
    paddingHorizontal: spacing[2],
    borderRadius: radius.bubble,
    marginVertical: 3,
  },
  wrapOut: { alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  wrapIn: { alignSelf: 'flex-start', borderBottomLeftRadius: 4 },
  sender: { ...typography.small, fontWeight: '600', marginBottom: 2 },
  text: { ...typography.body },
  attachment: { marginBottom: spacing[0] },
  metaRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-end', marginTop: 2 },
  meta: { fontSize: 10 },
  tick: { marginLeft: 3 },
});
