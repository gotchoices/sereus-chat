/**
 * ChatInterface — one strand's conversation.
 * Spec: design/specs/mobile/screens/chat-interface.md
 *
 * Deliberately absent, and not to be added back:
 *   · delivery / read indicators — none is tracked
 *   · a pending or "sending" state — the phone holds the strand, so a send is
 *     a local write; only a genuine write failure surfaces
 *   · link previews — nothing is fetched from a pasted URL
 *   · a manufactured "message deleted" placeholder
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TextInput, FlatList, Pressable, Image, StyleSheet, Alert,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation, useRoute } from '@react-navigation/native';
import {
  listMessages, listMembers, getStrandState, send, deleteMessage, react,
} from '../data/adapter';
import type { Message, Member, StrandState, Attachment } from '../data/types';
import { useT } from '../i18n';
import {
  MessageBubble, EmptyState, Banner, IconButton, Avatar, StrandStatus,
} from '../components';
import { useTheme, typography, spacing, radius } from '../theme';

const DRAFT_KEY = (id: string) => `@sereus.chat/draft/${id}`;
const READ_KEY = (id: string) => `@sereus.chat/read/${id}`;
const GROUP_GAP_MS = 5 * 60 * 1000;

const dayOf = (iso: string) => new Date(iso).toDateString();
const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/**
 * An attachment in a bubble.  `fetching` and `unreachable` are distinct states
 * and neither is a broken image — a null uri never means the thing is absent
 * (design/specs/domain/overview.md).
 */
function AttachmentView({ a, onPress }: { a: Attachment; onPress: () => void }) {
  const theme = useTheme();
  if (a.locality === 'local' && a.uri && (a.type === 'image' || a.type === 'video')) {
    return (
      <Pressable onPress={onPress}>
        <Image source={{ uri: a.uri }} style={styles.attachImage} />
      </Pressable>
    );
  }
  const label =
    a.locality === 'fetching' ? 'Coming…'
      : a.locality === 'unreachable' ? 'Not reachable right now'
        : a.name ?? a.type;
  return (
    <Pressable onPress={onPress}
      style={[styles.attachChip, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}>
      <Text style={[typography.small, { color: theme.textMuted }]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

type Row =
  | { kind: 'message'; msg: Message; showSender: boolean; showMeta: boolean }
  | { kind: 'day'; label: string }
  | { kind: 'unread' };

export default function ChatInterface() {
  const navigation: any = useNavigation();
  const route: any = useRoute();
  const { strandId, title } = route.params ?? {};
  const t = useT();
  const theme = useTheme();
  const listRef = useRef<FlatList<Row>>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [state, setState] = useState<StrandState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [readCursor, setReadCursor] = useState<string | null>(null);
  const [atEnd, setAtEnd] = useState(true);

  const me = members.find(m => m.isMe);
  const isGroup = members.length > 2;
  const nameOf = useCallback(
    (id: string) => members.find(m => m.id === id)?.name ?? id.slice(0, 8),
    [members],
  );

  const load = useCallback(async () => {
    try {
      const [msgs, mem] = await Promise.all([listMessages(strandId), listMembers(strandId)]);
      setMessages(msgs);
      setMembers(mem);
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? 'Could not reach this conversation right now');
    }
    getStrandState(strandId).then(setState).catch(() => {});
  }, [strandId]);

  useEffect(() => { void load(); }, [load]);

  // Draft and read cursor are device-local.  Nothing unsent leaves the phone.
  useEffect(() => {
    AsyncStorage.getItem(DRAFT_KEY(strandId)).then(v => v && setDraft(v));
    AsyncStorage.getItem(READ_KEY(strandId)).then(setReadCursor);
  }, [strandId]);
  useEffect(() => { AsyncStorage.setItem(DRAFT_KEY(strandId), draft).catch(() => {}); }, [draft, strandId]);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    let lastDay = '';
    let unreadPlaced = false;
    messages.forEach((m, i) => {
      const prev = messages[i - 1];
      const day = dayOf(m.timestamp);
      if (day !== lastDay) { out.push({ kind: 'day', label: day }); lastDay = day; }
      if (!unreadPlaced && readCursor && m.id > readCursor && m.memberId !== me?.id) {
        out.push({ kind: 'unread' });
        unreadPlaced = true;
      }
      const grouped =
        prev &&
        prev.memberId === m.memberId &&
        Date.parse(m.timestamp) - Date.parse(prev.timestamp) < GROUP_GAP_MS &&
        dayOf(prev.timestamp) === day;
      const next = messages[i + 1];
      const lastOfGroup =
        !next || next.memberId !== m.memberId ||
        Date.parse(next.timestamp) - Date.parse(m.timestamp) >= GROUP_GAP_MS;
      out.push({
        kind: 'message',
        msg: m,
        // Sender name only in strands of more than two.
        showSender: isGroup && m.memberId !== me?.id && !grouped,
        showMeta: lastOfGroup,
      });
    });
    return out.reverse();
  }, [messages, readCursor, me?.id, isGroup]);

  const doSend = async () => {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    const pendingReply = replyTo?.id ?? null;
    setReplyTo(null);
    try {
      const msg = await send(strandId, { content: text, replyToId: pendingReply });
      setMessages(prev => [...prev, msg]);
      await AsyncStorage.setItem(READ_KEY(strandId), msg.id);
    } catch (e: any) {
      // A genuine write failure — keep what they wrote.
      setDraft(text);
      setError(e?.message ?? 'That message could not be written');
    }
  };

  const messageActions = (m: Message) => {
    const mine = m.memberId === me?.id;
    Alert.alert(nameOf(m.memberId), m.content, [
      { text: t('actions.reply', 'Reply'), onPress: () => setReplyTo(m) },
      { text: t('actions.react', 'React 👍'), onPress: () => react(m.id, '👍').then(load).catch(() => {}) },
      ...(mine
        ? [{
            text: t('actions.delete', 'Delete'), style: 'destructive' as const,
            onPress: () => deleteMessage(m.id).then(load).catch(() => {}),
          }]
        : []),
      { text: t('common.cancel', 'Cancel'), style: 'cancel' as const },
    ]);
  };

  const renderRow = ({ item }: { item: Row }) => {
    if (item.kind === 'day') {
      return <Text style={[typography.small, styles.divider, { color: theme.textMuted }]}>{item.label}</Text>;
    }
    if (item.kind === 'unread') {
      return (
        <View style={styles.unreadRow}>
          <View style={[styles.rule, { backgroundColor: theme.accent }]} />
          <Text style={[typography.small, { color: theme.accent }]}>{t('screens.chat.unread', 'New')}</Text>
          <View style={[styles.rule, { backgroundColor: theme.accent }]} />
        </View>
      );
    }
    const m = item.msg;
    const mine = m.memberId === me?.id;
    const parent = m.replyToId ? messages.find(x => x.id === m.replyToId) : undefined;
    const grouped = m.reactions.reduce<Record<string, { count: number; mine: boolean }>>((acc, r) => {
      const e = (acc[r.symbol] ||= { count: 0, mine: false });
      e.count++; if (r.memberId === me?.id) e.mine = true;
      return acc;
    }, {});
    return (
      <MessageBubble
        testID={`message-${m.id}`}
        text={m.content}
        outgoing={mine}
        senderName={item.showSender ? nameOf(m.memberId) : null}
        timestamp={item.showMeta ? clock(m.timestamp) : null}
        edited={!!m.editedAt}
        replyTo={
          m.replyToId
            ? {
                senderName: parent ? nameOf(parent.memberId) : null,
                // The original is gone — say so rather than hiding it.
                excerpt: parent ? parent.content : null,
              }
            : null
        }
        reactions={Object.entries(grouped).map(([symbol, v]) => ({ symbol, ...v }))}
        attachment={
          m.attachments.length
            ? m.attachments.map(a => (
                <AttachmentView key={a.id} a={a}
                  onPress={() => navigation.navigate('MediaViewer',
                    { strandId, attachmentId: a.id, setFilter: 'all', title })} />
              ))
            : undefined
        }
        onLongPress={() => messageActions(m)}
      />
    );
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      {state ? (
        <Pressable onPress={() => navigation.navigate('StrandDetail', { strandId, title })}
          style={[styles.statusStrip, { borderBottomColor: theme.divider }]}>
          <StrandStatus state={state} variant="compact" />
        </Pressable>
      ) : null}

      {error ? <Banner message={error} action={{ label: t('common.retry', 'Retry'), onPress: load }} /> : null}

      {messages.length === 0 && !error ? (
        <EmptyState icon="chatbubble-ellipses-outline"
          title={t('screens.chat.emptyTitle', 'Nothing said yet')}
          hint={t('screens.chat.empty', 'Say something — it is just the two of you until anyone else is invited.')} />
      ) : (
        <FlatList
          ref={listRef}
          testID="message-list"
          data={rows}
          inverted
          keyExtractor={(r, i) => (r.kind === 'message' ? r.msg.id : `${r.kind}-${i}`)}
          contentContainerStyle={styles.list}
          renderItem={renderRow}
          onScroll={e => setAtEnd(e.nativeEvent.contentOffset.y < 40)}
          scrollEventThrottle={64}
        />
      )}

      {!atEnd ? (
        <Pressable style={[styles.jump, { backgroundColor: theme.accent }]}
          onPress={() => listRef.current?.scrollToOffset({ offset: 0, animated: true })}>
          <Text style={[typography.small, { color: theme.accentText }]}>
            {t('screens.chat.jump', 'Latest')}
          </Text>
        </Pressable>
      ) : null}

      {replyTo ? (
        <View style={[styles.replyBar, { backgroundColor: theme.surfaceAlt, borderTopColor: theme.divider }]}>
          <View style={styles.flex1}>
            <Text style={[typography.small, { color: theme.textMuted }]}>
              {t('screens.chat.replyingTo', 'Replying to {{name}}').replace('{{name}}', nameOf(replyTo.memberId))}
            </Text>
            <Text numberOfLines={1} style={[typography.small, { color: theme.textPrimary }]}>{replyTo.content}</Text>
          </View>
          <IconButton name="close-outline" size={18} accessibilityLabel={t('common.cancel', 'Cancel')} onPress={() => setReplyTo(null)} />
        </View>
      ) : null}

      <View style={[styles.composer, { borderTopColor: theme.divider, backgroundColor: theme.surface }]}>
        <IconButton name="add-outline" size={22} accessibilityLabel={t('actions.attach', 'Attach')}
          onPress={() => navigation.navigate('MediaPicker', { purpose: 'attachment', strandId })} />
        <TextInput
          testID="composer"
          value={draft}
          onChangeText={setDraft}
          multiline
          placeholder={t('screens.chat.placeholder', 'Message')}
          placeholderTextColor={theme.textMuted}
          style={[typography.body, styles.input, { color: theme.textPrimary, backgroundColor: theme.surfaceAlt }]}
        />
        <IconButton name="send-outline" size={22} variant="accent"
          accessibilityLabel={t('actions.send', 'Send')} onPress={doSend} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  statusStrip: { paddingHorizontal: spacing[3], paddingVertical: spacing[1], borderBottomWidth: StyleSheet.hairlineWidth },
  list: { padding: spacing[2] },
  divider: { textAlign: 'center', paddingVertical: spacing[1] },
  unreadRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[1], paddingVertical: spacing[1] },
  rule: { flex: 1, height: StyleSheet.hairlineWidth },
  jump: { position: 'absolute', right: spacing[3], bottom: 84, paddingHorizontal: spacing[2], paddingVertical: 6, borderRadius: radius.pill },
  replyBar: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], padding: spacing[2], borderTopWidth: StyleSheet.hairlineWidth },
  flex1: { flex: 1 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing[1], padding: spacing[2], borderTopWidth: StyleSheet.hairlineWidth },
  input: { flex: 1, maxHeight: 120, minHeight: 38, borderRadius: radius.control, paddingHorizontal: spacing[2], paddingVertical: spacing[1] },
  attachImage: { width: 200, height: 140, borderRadius: radius.control },
  attachChip: { paddingHorizontal: spacing[2], paddingVertical: spacing[1], borderRadius: radius.control, borderWidth: StyleSheet.hairlineWidth },
});
