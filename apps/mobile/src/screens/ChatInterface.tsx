import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity } from 'react-native';
import { useRoute, useNavigation, useFocusEffect } from '@react-navigation/native';
import { listMessages, sendMessage } from '../data/adapter';
import type { ChatMessage } from '../data/types';
import { useT } from '../i18n';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { consumePendingAttachment } from '../data/attachmentDraft';
import Clipboard from '@react-native-clipboard/clipboard';
import { showToast } from '../ui/toast';
import { MessageBubble, EmptyState, IconButton } from '../components';
import { useTheme, typography, spacing, radius } from '../theme';

/**
 * Reconcile a poll result with prior state.  Keeps any optimistic ('pending-*')
 * messages still in flight so the user doesn't see them flash out and back in
 * between optimistic-append and sendMessage-resolve.
 */
function mergePersisted(prev: ChatMessage[], next: ChatMessage[]): ChatMessage[] {
  const persistedIds = new Set(next.map(m => m.id));
  const pending = prev.filter(m => m.id.startsWith('pending-') && !persistedIds.has(m.id));
  return [...next, ...pending];
}

export default function ChatInterface() {
  const route: any = useRoute();
  const navigation: any = useNavigation();
  const strandId: string | undefined = route?.params?.strandId;
  const t = useT();
  const theme = useTheme();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState<string>('');
  const [attachments, setAttachments] = useState<Array<{ id: string; name: string; type: 'image' | 'file' }>>([]);
  const [inputHeight, setInputHeight] = useState<number>(40);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingOriginalText, setEditingOriginalText] = useState<string>('');
  const [menuForId, setMenuForId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const sid = strandId || 't-susan';
    const load = async () => {
      try {
        const data = await listMessages(sid);
        if (!alive) return;
        // Only update state if the persisted set differs from what we have,
        // so optimistic appends don't get reverted by an in-flight poll.
        setMessages(prev => mergePersisted(prev, data));
      } catch (err) {
        console.warn('listMessages poll failed:', err);
      }
    };
    void load();
    // Sereus has no live subscriptions yet; poll while screen is mounted.
    // Cadence per design/specs/domain/interfaces.md (~2s).
    const timer = setInterval(load, 2000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [strandId]);

  const canSend = useMemo(() => text.trim().length > 0 || attachments.length > 0, [text, attachments]);
  const isEditing = editingId != null;

  const formatTime = (iso: string | null) => {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      const hh = d.getHours().toString().padStart(2, '0');
      const mm = d.getMinutes().toString().padStart(2, '0');
      return `${hh}:${mm}`;
    } catch {
      return '';
    }
  };

  const onPressAttach = () => {
    navigation.navigate('MediaPicker');
  };

  const onRemoveAttachment = (id: string) => {
    setAttachments(prev => prev.filter(a => a.id !== id));
  };

  const onSend = () => {
    if (!canSend) return;
    if (isEditing && editingId) {
      setMessages(prev => prev.map(m => (m.id === editingId ? { ...m, text: text.trim() } : m)));
      setEditingId(null);
      setEditingOriginalText('');
      setText('');
      setAttachments([]);
      setInputHeight(40);
      return;
    }
    const trimmed = text.trim();
    setText('');
    setAttachments([]);
    setInputHeight(40);
    if (trimmed.length > 0) {
      // Optimistic append; the persisted message replaces the optimistic
      // one when sendMessage resolves (id may differ).
      const tempId = `pending-${Date.now()}`;
      const optimistic: ChatMessage = {
        id: tempId,
        strandId: strandId || 't-susan',
        sender: 'Me',
        text: trimmed,
        timestamp: new Date().toISOString(),
        outgoing: true,
        status: 'sent',
      };
      setMessages(prev => [...prev, optimistic]);
      (async () => {
        try {
          const persisted = await sendMessage(strandId || 't-susan', trimmed);
          setMessages(prev => prev.map(m => (m.id === tempId ? persisted : m)));
        } catch (err) {
          console.warn('sendMessage failed:', err);
          // Leave optimistic in place; future step adds explicit error UX.
        }
      })();
    }
  };

  const onMicPress = () => {
    showToast('Voice message not implemented');
  };

  const onCancelEdit = () => {
    setEditingId(null);
    setText('');
    setEditingOriginalText('');
  };

  useFocusEffect(
    React.useCallback(() => {
      const att = consumePendingAttachment();
      if (att) {
        setAttachments(prev => [...prev, { id: att.id, name: att.name ?? 'attachment', type: att.type === 'file' ? 'file' : 'image' }]);
      }
    }, []),
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {messages.length === 0 ? (
        <EmptyState
          testID="chat-empty"
          icon="chatbubbles-outline"
          title={t('screens.chat.empty', 'No messages yet. Say hello!')}
        />
      ) : (
        <FlatList
          contentContainerStyle={styles.list}
          data={messages}
          keyExtractor={(m) => m.id}
          testID="chat-list"
          accessibilityLabel="Messages list"
          renderItem={({ item, index }) => {
            const prev = index > 0 ? messages[index - 1] : undefined;
            const sameSenderAsPrev = !!prev && (prev.outgoing === item.outgoing) && (prev.sender === item.sender);
            const isOwn = !!item.outgoing;
            return (
              <View style={styles.rowWrap}>
                <View style={[styles.row, { justifyContent: isOwn ? 'flex-end' : 'flex-start' }]}>
                  <MessageBubble
                    testID={`message-${item.id}`}
                    text={item.text}
                    outgoing={isOwn}
                    senderName={!isOwn && !sameSenderAsPrev ? item.sender : undefined}
                    timestamp={item.timestamp ? formatTime(item.timestamp) : undefined}
                    status={item.status}
                    accessibilityLabel={isOwn ? 'Outgoing message' : `Message from ${item.sender}`}
                    onLongPress={() => {
                      if (isOwn) {
                        setEditingId(item.id);
                        setEditingOriginalText(item.text || '');
                        setText(item.text || '');
                      }
                    }}
                  />
                  <IconButton
                    name="ellipsis-vertical"
                    size={16}
                    color={theme.textMuted}
                    onPress={() => setMenuForId(prev => (prev === item.id ? null : item.id))}
                    accessibilityLabel="Message actions"
                    style={styles.kebabSlot}
                  />
                </View>
                {menuForId === item.id && (
                  <View style={[styles.menuPanel, styles.menuPanelAbs, isOwn ? styles.menuRight : styles.menuLeft, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                    {isOwn ? (
                      <>
                        <TouchableOpacity
                          style={styles.menuItem}
                          onPress={() => {
                            setEditingId(item.id);
                            setEditingOriginalText(item.text || '');
                            setText(item.text || '');
                            setMenuForId(null);
                          }}
                          accessibilityLabel={t('screens.chat.menu.edit', 'Edit')}
                        >
                          <Text style={{ color: theme.textPrimary }}>{t('screens.chat.menu.edit', 'Edit')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.menuItem}
                          onPress={() => {
                            setMessages(prev => prev.filter(m => m.id !== item.id));
                            setMenuForId(null);
                          }}
                          accessibilityLabel={t('screens.chat.menu.delete', 'Delete')}
                        >
                          <Text style={{ color: theme.danger }}>{t('screens.chat.menu.delete', 'Delete')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.menuItem}
                          onPress={() => {
                            Clipboard.setString(item.text || '');
                            setMenuForId(null);
                          }}
                          accessibilityLabel={t('screens.chat.menu.copy', 'Copy')}
                        >
                          <Text style={{ color: theme.textPrimary }}>{t('screens.chat.menu.copy', 'Copy')}</Text>
                        </TouchableOpacity>
                      </>
                    ) : (
                      <>
                        <TouchableOpacity
                          style={styles.menuItem}
                          onPress={() => {
                            const quote = item.text ? `> ${item.text}\n` : '';
                            setText(prev => (prev ? `${prev}\n${quote}` : quote));
                            setMenuForId(null);
                          }}
                          accessibilityLabel={t('screens.chat.menu.reply', 'Reply')}
                        >
                          <Text style={{ color: theme.textPrimary }}>{t('screens.chat.menu.reply', 'Reply')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.menuItem}
                          onPress={() => {
                            Clipboard.setString(item.text || '');
                            setMenuForId(null);
                          }}
                          accessibilityLabel={t('screens.chat.menu.copy', 'Copy')}
                        >
                          <Text style={{ color: theme.textPrimary }}>{t('screens.chat.menu.copy', 'Copy')}</Text>
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                )}
              </View>
            );
          }}
          keyboardShouldPersistTaps="handled"
        />
      )}
      {attachments.length > 0 && (
        <View style={styles.attachStrip}>
          <FlatList
            horizontal
            data={attachments}
            keyExtractor={(a) => a.id}
            renderItem={({ item }) => (
              <View style={[styles.attachChip, { backgroundColor: theme.surfaceAlt }]}>
                <Text style={[styles.attachName, { color: theme.textPrimary }]} numberOfLines={1}>{item.name}</Text>
                <TouchableOpacity style={[styles.attachClose, { backgroundColor: theme.surface }]} onPress={() => onRemoveAttachment(item.id)} accessibilityLabel="Remove attachment">
                  <Ionicons name="close" size={14} color={theme.textSecondary} />
                </TouchableOpacity>
              </View>
            )}
            showsHorizontalScrollIndicator={false}
          />
        </View>
      )}
      <View style={[styles.composer, { backgroundColor: theme.surface, borderTopColor: theme.divider }]}>
        <IconButton
          name="add"
          size={24}
          onPress={onPressAttach}
          accessibilityLabel={t('screens.chat.attach', 'Attach')}
          testID="composer-attach"
        />
        <View style={styles.inputWrapper}>
          <TextInput
            style={[
              styles.input,
              { backgroundColor: theme.surfaceAlt, borderColor: theme.border, color: theme.textPrimary, height: Math.min(Math.max(40, inputHeight), 120) },
            ]}
            placeholder={t('screens.chat.composerPlaceholder', 'Message')}
            placeholderTextColor={theme.textMuted}
            value={text}
            onChangeText={setText}
            multiline
            onContentSizeChange={(e) => setInputHeight(e.nativeEvent.contentSize.height)}
            accessibilityLabel={t('screens.chat.composerPlaceholder', 'Message')}
            testID="composer-input"
          />
        </View>
        {isEditing ? (
          <View style={styles.composeRightStack}>
            <IconButton
              name="close"
              size={20}
              color={theme.danger}
              onPress={onCancelEdit}
              accessibilityLabel={t('screens.chat.cancel', 'Cancel')}
              testID="composer-cancel"
            />
            <IconButton
              name="checkmark-outline"
              size={20}
              variant="accent"
              onPress={onSend}
              accessibilityLabel={t('screens.chat.save', 'Save')}
              testID="composer-save"
              style={styles.saveBtn}
            />
          </View>
        ) : (
          <IconButton
            name={canSend ? 'send-outline' : 'mic-outline'}
            size={20}
            variant={canSend ? 'accent' : 'plain'}
            onPress={canSend ? onSend : onMicPress}
            accessibilityLabel={canSend ? t('screens.chat.send', 'Send') : t('screens.chat.record', 'Record')}
            testID={canSend ? 'composer-send' : 'composer-mic'}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { paddingHorizontal: spacing[3], paddingTop: spacing[1], paddingBottom: spacing[5] },
  rowWrap: { position: 'relative' },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  kebabSlot: { minWidth: 24, marginLeft: spacing[0] },
  menuPanel: { borderWidth: 1, borderRadius: radius.control, paddingVertical: spacing[0], minWidth: 160, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 6, elevation: 2 },
  menuPanelAbs: { position: 'absolute', top: -4, zIndex: 5 },
  menuLeft: { left: 0 },
  menuRight: { right: 0 },
  menuItem: { paddingHorizontal: spacing[2], paddingVertical: spacing[1] },
  attachStrip: { paddingVertical: spacing[0], paddingHorizontal: spacing[3] },
  attachChip: { borderRadius: radius.card, paddingVertical: spacing[0], paddingHorizontal: spacing[1], marginRight: spacing[1], position: 'relative' },
  attachName: { maxWidth: 140 },
  attachClose: { position: 'absolute', top: -6, right: -6, borderRadius: 10, padding: 2, elevation: 2 },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: spacing[2],
    paddingTop: spacing[1],
    paddingBottom: spacing[1],
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  inputWrapper: { flex: 1, marginHorizontal: spacing[1] },
  input: {
    borderWidth: 1,
    borderRadius: radius.control,
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
    ...typography.body,
  },
  composeRightStack: { alignItems: 'center', justifyContent: 'flex-end' },
  saveBtn: { marginTop: spacing[0] },
});
