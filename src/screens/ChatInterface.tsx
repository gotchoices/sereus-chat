import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { useVariant } from '../mock/VariantContext';
import { listMessages, type ChatMessage } from '../data/messages';
import { useT } from '../i18n';
import Ionicons from 'react-native-vector-icons/Ionicons';

export default function ChatInterface() {
  const route: any = useRoute();
  const threadId: string | undefined = route?.params?.threadId;
  const { mockMode, variant } = useVariant();
  const t = useT();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState<string>('');
  const [attachments, setAttachments] = useState<Array<{ id: string; name: string; type: 'image' | 'file' }>>([]);
  const [inputHeight, setInputHeight] = useState<number>(40);

  useEffect(() => {
    (async () => {
      const active = mockMode ? (variant as 'happy' | 'empty' | 'error') : 'happy';
      const data = await listMessages(threadId || 'susan', active);
      setMessages(data);
    })();
  }, [threadId, mockMode, variant]);

  const canSend = useMemo(() => text.trim().length > 0 || attachments.length > 0, [text, attachments]);

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
    // Stub: add a provisional attachment to demonstrate strip
    const id = `a-${Date.now()}`;
    setAttachments(prev => [...prev, { id, name: 'photo.jpg', type: 'image' }]);
  };

  const onRemoveAttachment = (id: string) => {
    setAttachments(prev => prev.filter(a => a.id !== id));
  };

  const onSend = () => {
    if (!canSend) return;
    const newMsg: ChatMessage = {
      id: `m-${Date.now()}`,
      threadId: threadId || 't-susan',
      sender: 'Me',
      text: text.trim(),
      timestamp: new Date().toISOString(),
      outgoing: true,
    };
    setMessages(prev => [...prev, ...(text.trim() ? [newMsg] : [])]);
    setText('');
    setAttachments([]);
    setInputHeight(40);
  };

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
          renderItem={({ item, index }) => {
            const prev = index > 0 ? messages[index - 1] : undefined;
            const sameSenderAsPrev = !!prev && (prev.outgoing === item.outgoing) && (prev.sender === item.sender);
            const bubbleStyle = [
              styles.bubble,
              item.outgoing ? styles.out : styles.in,
              sameSenderAsPrev ? styles.tight : styles.loose,
            ];
            return (
              <View
                style={bubbleStyle}
                accessible
                accessibilityLabel={item.outgoing ? 'Outgoing message' : `Message from ${item.sender}`}
                testID={`message-${item.id}`}
              >
                <Text style={styles.bubbleText}>{item.text}</Text>
                {!!item.timestamp && <Text style={styles.time}>{formatTime(item.timestamp)}</Text>}
              </View>
            );
          }}
          keyboardShouldPersistTaps="handled"
        />
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
          accessibilityLabel={canSend ? t('screens.chat.send', 'Send') : t('screens.chat.record', 'Record')}
          testID={canSend ? 'composer-send' : 'composer-mic'}
        >
          <Ionicons name={canSend ? 'send-outline' : 'mic-outline'} size={20} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 20 },
  empty: { paddingVertical: 20 },
  list: { paddingTop: 8, paddingBottom: 90 },
  bubble: { maxWidth: '80%', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 14 },
  tight: { marginTop: 4, marginBottom: 4 },
  loose: { marginTop: 10, marginBottom: 8 },
  in: { alignSelf: 'flex-start', backgroundColor: '#f0f0f0' },
  out: { alignSelf: 'flex-end', backgroundColor: '#d7eeff' },
  bubbleText: { fontSize: 15 },
  time: { fontSize: 11, color: '#666', marginTop: 4, alignSelf: 'flex-end' },
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
  input: { fontSize: 16, padding: 0 }
});


