import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity } from 'react-native';
import { useRoute, useNavigation, useFocusEffect } from '@react-navigation/native';
import { useVariant } from '../mock/VariantContext';
import { listMessages, type ChatMessage } from '../data/messages';
import { useT } from '../i18n';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { consumePendingAttachment, type ProvisionalAttachment } from '../data/attachmentDraft';
import Clipboard from '@react-native-clipboard/clipboard';

export default function ChatInterface() {
  const route: any = useRoute();
  const navigation: any = useNavigation();
  const strandId: string | undefined = route?.params?.strandId;
  const { mockMode, variant } = useVariant();
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
      const active = mockMode ? (variant as 'happy' | 'empty' | 'error') : 'happy';
      const data = await listMessages(strandId || 't-susan', active);
      setMessages(data);
    })();
  }, [strandId, mockMode, variant]);

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

  const onCancelEdit = () => {
    setEditingId(null);
    setText('');
    setEditingOriginalText('');
  };

  // Consume pending attachment when screen gains focus
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
      {/* Consume any pending attachment from MediaPicker when focused */}
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
              <View>
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
                  <View style={[styles.menuPanel, isOwn ? styles.menuPanelOwn : undefined]}>
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
      {/* Editing banner */}
      {isEditing && (
        <View style={styles.editBar} accessibilityLabel="Editing message bar">
          <Text style={styles.editTitle}>{t('screens.chat.editingTitle', 'Editing')}</Text>
          <View style={{ flex: 1 }} />
          <TouchableOpacity onPress={onCancelEdit} accessibilityLabel={t('screens.chat.cancel', 'Cancel')} style={styles.editBtn}>
            <Text style={styles.editBtnText}>{t('screens.chat.cancel', 'Cancel')}</Text>
          </TouchableOpacity>
        </View>
      )}
      {/* Provisional attachments strip */}
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
      {/* Composer */}
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
        <TouchableOpacity
          style={[styles.composeButton, canSend ? styles.primary : undefined]}
          onPress={canSend ? onSend : undefined}
          accessibilityLabel={
            isEditing
              ? t('screens.chat.save', 'Save')
              : canSend
              ? t('screens.chat.send', 'Send')
              : t('screens.chat.record', 'Record')
          }
          testID={isEditing ? 'composer-save' : canSend ? 'composer-send' : 'composer-mic'}
        >
          <Ionicons name={isEditing ? 'checkmark-outline' : canSend ? 'send-outline' : 'mic-outline'} size={20} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 20 },
  empty: { paddingVertical: 20 },
  list: { paddingTop: 8, paddingBottom: 90 },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  bubble: { maxWidth: '80%', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 14 },
  tight: { marginTop: 4, marginBottom: 4 },
  loose: { marginTop: 10, marginBottom: 8 },
  in: { alignSelf: 'flex-start', backgroundColor: '#f0f0f0' },
  out: { alignSelf: 'flex-end', backgroundColor: '#d7eeff' },
  bubbleText: { fontSize: 15 },
  time: { fontSize: 11, color: '#666', marginTop: 4, alignSelf: 'flex-end' },
  kebabSlot: { width: 24, alignItems: 'center', justifyContent: 'flex-start', paddingTop: 2, marginLeft: 6 },
  menuPanel: { alignSelf: 'flex-start', backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd', borderRadius: 8, paddingVertical: 6, marginTop: 4, minWidth: 160, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 6, elevation: 2 },
  menuPanelOwn: { alignSelf: 'flex-end' },
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
  editBar: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 12, backgroundColor: '#fff7e6', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#f0c36d' },
  editTitle: { color: '#a66a00', fontWeight: '600' },
  editingHighlight: { textDecorationLine: 'underline' },
  editBtn: { paddingHorizontal: 10, paddingVertical: 6 },
  editBtnText: { color: '#444' },
  editSave: { backgroundColor: '#0066cc', borderRadius: 6 },
  editSaveText: { color: '#fff' }
});


