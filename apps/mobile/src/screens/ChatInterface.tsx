import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity } from 'react-native';
import { useRoute, useNavigation, useFocusEffect } from '@react-navigation/native';
import { listMessages } from '../data/adapter';
import type { ChatMessage } from '../data/types';
import { useT } from '../i18n';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { consumePendingAttachment } from '../data/attachmentDraft';
import Clipboard from '@react-native-clipboard/clipboard';
import { showToast } from '../ui/toast';

export default function ChatInterface() {
  const route: any = useRoute();
  const navigation: any = useNavigation();
  const strandId: string | undefined = route?.params?.strandId;
  const t = useT();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState<string>('');
  const [attachments, setAttachments] = useState<Array<{ id: string; name: string; type: 'image' | 'file' }>>([]);
  const [inputHeight, setInputHeight] = useState<number>(40);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingOriginalText, setEditingOriginalText] = useState<string>('');
  const [menuForId, setMenuForId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const data = await listMessages(strandId || 't-susan');
      setMessages(data);
    })();
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
    if (trimmed.length > 0) {
      const newMsg: ChatMessage = {
        id: `m-${Date.now()}`,
        strandId: strandId || 't-susan',
        sender: 'Me',
        text: trimmed,
        timestamp: new Date().toISOString(),
        outgoing: true,
      };
      setMessages(prev => [...prev, newMsg]);
    }
    setText('');
    setAttachments([]);
    setInputHeight(40);
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
    <View style={styles.container}>
      {messages.length === 0 ? (
        <View style={styles.empty} testID="chat-empty"><Text>{t('screens.chat.empty', 'No messages yet. Say hello!')}</Text></View>
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
            const bubbleStyle = [
              styles.bubble,
              item.outgoing ? styles.out : styles.in,
              sameSenderAsPrev ? styles.tight : styles.loose,
            ];
            const isOwn = !!item.outgoing;
            return (
              <View style={styles.rowWrap}>
                <View style={[styles.row, { justifyContent: isOwn ? 'flex-end' : 'flex-start' }]}>
                  <View
                    style={bubbleStyle}
                    accessible
                    accessibilityLabel={item.outgoing ? 'Outgoing message' : `Message from ${item.sender}`}
                    testID={`message-${item.id}`}
                    onLongPress={() => {
                      if (isOwn) {
                        setEditingId(item.id);
                        setEditingOriginalText(item.text || '');
                        setText(item.text || '');
                      }
                    }}
                  >
                    <Text style={[styles.bubbleText, isEditing && editingId === item.id ? styles.editingHighlight : undefined]}>{item.text}</Text>
                    {!!item.timestamp && <Text style={styles.time}>{formatTime(item.timestamp)}</Text>}
                  </View>
                  <TouchableOpacity
                    onPress={() => setMenuForId(prev => (prev === item.id ? null : item.id))}
                    accessibilityLabel="Message actions"
                    style={styles.kebabSlot}
                  >
                    <Ionicons name="ellipsis-vertical" size={14} color="#666" />
                  </TouchableOpacity>
                </View>
                {menuForId === item.id && (
                  <View style={[styles.menuPanel, styles.menuPanelAbs, isOwn ? styles.menuRight : styles.menuLeft]}>
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
                          <Text>{t('screens.chat.menu.edit', 'Edit')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.menuItem}
                          onPress={() => {
                            setMessages(prev => prev.filter(m => m.id !== item.id));
                            setMenuForId(null);
                          }}
                          accessibilityLabel={t('screens.chat.menu.delete', 'Delete')}
                        >
                          <Text style={{ color: '#b00020' }}>{t('screens.chat.menu.delete', 'Delete')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.menuItem}
                          onPress={() => {
                            Clipboard.setString(item.text || '');
                            setMenuForId(null);
                          }}
                          accessibilityLabel={t('screens.chat.menu.copy', 'Copy')}
                        >
                          <Text>{t('screens.chat.menu.copy', 'Copy')}</Text>
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
                          <Text>{t('screens.chat.menu.reply', 'Reply')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.menuItem}
                          onPress={() => {
                            Clipboard.setString(item.text || '');
                            setMenuForId(null);
                          }}
                          accessibilityLabel={t('screens.chat.menu.copy', 'Copy')}
                        >
                          <Text>{t('screens.chat.menu.copy', 'Copy')}</Text>
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
              <View style={styles.attachChip}>
                <Text style={styles.attachName} numberOfLines={1}>{item.name}</Text>
                <TouchableOpacity style={styles.attachClose} onPress={() => onRemoveAttachment(item.id)} accessibilityLabel="Remove attachment">
                  <Ionicons name="close" size={14} />
                </TouchableOpacity>
              </View>
            )}
            showsHorizontalScrollIndicator={false}
          />
        </View>
      )}
      <View style={styles.composer}>
        <TouchableOpacity
          style={styles.composeButton}
          onPress={onPressAttach}
          accessibilityLabel={t('screens.chat.attach', 'Attach')}
          testID="composer-attach"
        >
          <Ionicons name="add" size={22} />
        </TouchableOpacity>
        <View style={styles.inputWrapper}>
          <TextInput
            style={[styles.input, { height: Math.min(Math.max(40, inputHeight), 120) }]}
            placeholder={t('screens.chat.composerPlaceholder', 'Message')}
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
            <TouchableOpacity
              style={styles.composeIconBtn}
              onPress={onCancelEdit}
              accessibilityLabel={t('screens.chat.cancel', 'Cancel')}
              testID="composer-cancel"
            >
              <Ionicons name="close" size={20} color="#b00020" />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.composeIconBtn, styles.saveBtn, { marginTop: 6 }]}
              onPress={onSend}
              accessibilityLabel={t('screens.chat.save', 'Save')}
              testID="composer-save"
            >
              <Ionicons name="checkmark-outline" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.composeButton, canSend ? styles.primary : undefined]}
            onPress={canSend ? onSend : onMicPress}
            accessibilityLabel={canSend ? t('screens.chat.send', 'Send') : t('screens.chat.record', 'Record')}
            testID={canSend ? 'composer-send' : 'composer-mic'}
          >
            <Ionicons name={canSend ? 'send-outline' : 'mic-outline'} size={20} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 20 },
  empty: { paddingVertical: 20 },
  list: { paddingTop: 8, paddingBottom: 90 },
  rowWrap: { position: 'relative' },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  bubble: { maxWidth: '80%', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 14 },
  tight: { marginTop: 4, marginBottom: 4 },
  loose: { marginTop: 10, marginBottom: 8 },
  in: { alignSelf: 'flex-start', backgroundColor: '#f0f0f0' },
  out: { alignSelf: 'flex-end', backgroundColor: '#d7eeff' },
  bubbleText: { fontSize: 15 },
  time: { fontSize: 11, color: '#666', marginTop: 4, alignSelf: 'flex-end' },
  kebabSlot: { width: 24, alignItems: 'center', justifyContent: 'flex-start', paddingTop: 2, marginLeft: 6 },
  menuPanel: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd', borderRadius: 8, paddingVertical: 6, minWidth: 160, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 6, elevation: 2 },
  menuPanelAbs: { position: 'absolute', top: -4, zIndex: 5 },
  menuLeft: { left: 0 },
  menuRight: { right: 0 },
  menuItem: { paddingHorizontal: 12, paddingVertical: 8 },
  attachStrip: { paddingVertical: 6 },
  attachChip: { backgroundColor: '#f4f4f4', borderRadius: 12, paddingVertical: 6, paddingHorizontal: 10, marginRight: 8, position: 'relative' },
  attachName: { maxWidth: 140 },
  attachClose: { position: 'absolute', top: -6, right: -6, backgroundColor: '#fff', borderRadius: 10, padding: 2, elevation: 2 },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingTop: 8,
    paddingBottom: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#ddd'
  },
  composeButton: { padding: 8, alignItems: 'center', justifyContent: 'center' },
  primary: {},
  inputWrapper: { flex: 1, marginHorizontal: 8, borderWidth: 1, borderColor: '#ddd', borderRadius: 16, paddingHorizontal: 10, paddingVertical: 6 },
  input: { fontSize: 16, padding: 0 },
  editingHighlight: { textDecorationLine: 'underline' },
  composeRightStack: { alignItems: 'center', justifyContent: 'flex-end' },
  composeIconBtn: { padding: 8, alignItems: 'center', justifyContent: 'center', borderRadius: 6 },
  saveBtn: { backgroundColor: '#2e7d32' }
});
