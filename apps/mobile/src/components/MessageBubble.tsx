/**
 * MessageBubble — one chat message.
 *
 * ui.md: outgoing = accent / accentText; incoming = surfaceAlt / textPrimary;
 * radius 16; max width ~80%.
 *
 * NO DELIVERY OR READ INDICATOR.  None is tracked anywhere in this app and none
 * may be added: a reply is the only evidence a message was read
 * (design/specs/domain/schema.md, stories 04 and 10).  The status tick this
 * component used to render has been removed deliberately.
 *
 * Sender name appears on incoming messages ONLY in strands of more than two —
 * in a two-party conversation there is no ambiguity to resolve.
 */

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTheme, typography, spacing, radius } from '../theme';

export interface ReplyQuote {
  /** null when the original has been removed — say so, do not hide it. */
  senderName: string | null;
  excerpt: string | null;
  onPress?: () => void;
}

export interface MessageBubbleProps {
  text: string;
  outgoing?: boolean;
  /** Pass only in strands of more than two. */
  senderName?: string | null;
  timestamp?: string | null;
  edited?: boolean;
  replyTo?: ReplyQuote | null;
  reactions?: Array<{ symbol: string; count: number; mine: boolean }>;
  attachment?: React.ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  onReactionPress?: (symbol: string) => void;
  testID?: string;
  accessibilityLabel?: string;
}

export function MessageBubble({
  text,
  outgoing = false,
  senderName,
  timestamp,
  edited,
  replyTo,
  reactions,
  attachment,
  onPress,
  onLongPress,
  onReactionPress,
  testID,
  accessibilityLabel,
}: MessageBubbleProps) {
  const theme = useTheme();
  const bg = outgoing ? theme.accent : theme.surfaceAlt;
  const fg = outgoing ? theme.accentText : theme.textPrimary;
  const meta = outgoing ? theme.accentText : theme.textMuted;

  return (
    <View style={[styles.row, outgoing ? styles.rowRight : styles.rowLeft]}>
      <Pressable
        testID={testID}
        onPress={onPress}
        onLongPress={onLongPress}
        accessibilityLabel={accessibilityLabel}
        style={[styles.bubble, { backgroundColor: bg }]}
      >
        {senderName ? (
          <Text style={[typography.small, styles.sender, { color: meta }]}>{senderName}</Text>
        ) : null}

        {replyTo ? (
          <Pressable
            onPress={replyTo.onPress}
            style={[styles.quote, { borderLeftColor: meta, backgroundColor: theme.background + '22' }]}
          >
            {replyTo.excerpt === null ? (
              <Text style={[typography.small, styles.quoteGone, { color: meta }]}>
                The message this replies to is gone
              </Text>
            ) : (
              <>
                {replyTo.senderName ? (
                  <Text style={[typography.small, styles.sender, { color: meta }]}>
                    {replyTo.senderName}
                  </Text>
                ) : null}
                <Text numberOfLines={2} style={[typography.small, { color: meta }]}>
                  {replyTo.excerpt}
                </Text>
              </>
            )}
          </Pressable>
        ) : null}

        {attachment ? <View style={styles.attachment}>{attachment}</View> : null}
        {text ? <Text style={[typography.body, { color: fg }]}>{text}</Text> : null}

        {(timestamp || edited) && (
          <View style={styles.metaRow}>
            {timestamp ? (
              <Text style={[typography.small, { color: meta }]}>{timestamp}</Text>
            ) : null}
            {edited ? (
              <Text style={[typography.small, { color: meta }]}>edited</Text>
            ) : null}
          </View>
        )}
      </Pressable>

      {reactions && reactions.length > 0 ? (
        <View style={[styles.reactions, outgoing ? styles.rowRight : styles.rowLeft]}>
          {reactions.map(r => (
            <Pressable
              key={r.symbol}
              onPress={() => onReactionPress?.(r.symbol)}
              style={[
                styles.reaction,
                {
                  backgroundColor: theme.surfaceAlt,
                  borderColor: r.mine ? theme.accent : theme.border,
                },
              ]}
            >
              <Text style={typography.small}>
                {r.symbol}
                {r.count > 1 ? ` ${r.count}` : ''}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { marginVertical: 2, maxWidth: '80%' },
  rowLeft: { alignSelf: 'flex-start' },
  rowRight: { alignSelf: 'flex-end' },
  bubble: {
    borderRadius: radius.bubble,
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
    gap: 2,
  },
  sender: { fontWeight: '600' },
  quote: {
    borderLeftWidth: 3,
    paddingLeft: spacing[1],
    paddingVertical: 2,
    marginBottom: 2,
    borderRadius: 4,
  },
  quoteGone: { fontStyle: 'italic' },
  attachment: { marginBottom: 2 },
  metaRow: { flexDirection: 'row', gap: spacing[1], alignSelf: 'flex-end' },
  reactions: { flexDirection: 'row', gap: 4, marginTop: 2 },
  reaction: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
