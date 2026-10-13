/**
 * MediaViewer — one attachment, full screen, with the rest of the set to hand.
 * Spec: design/specs/mobile/screens/media-viewer.md
 */

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Image, FlatList, useWindowDimensions, StyleSheet, Share, Alert } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { Attachment } from '@chat/core';
import { orThrow, useModel } from '../data/bind';
import { useErrorText, useT } from '../i18n';
import { IconButton, Banner } from '../components';
import { useTheme, typography, spacing } from '../theme';

/** Chrome colour for the dark viewer ground — not a theme token on purpose. */
const ON_DARK = '#e8eaec';

export default function MediaViewer() {
  const model = useModel();
  const navigation: any = useNavigation();
  const route: any = useRoute();
  const { strandId, attachmentId, setFilter } = route.params ?? {};
  const { width, height } = useWindowDimensions();
  const t = useT();
  const errorText = useErrorText();
  const theme = useTheme();

  const [items, setItems] = useState<Attachment[]>([]);
  const [index, setIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const all = orThrow(await model.media.list(strandId));
      // The swipe set is what the caller was showing — never silently wider.
      const set = setFilter && setFilter !== 'all' ? all.filter(a => a.type === setFilter) : all;
      setItems(set);
      const i = set.findIndex(a => a.id === attachmentId);
      setIndex(i >= 0 ? i : 0);
    } catch (e: any) {
      setError(errorText(e, 'That could not be opened'));
    }
  }, [model, strandId, attachmentId, setFilter, errorText]);

  useEffect(() => { void load(); }, [load]);

  const current = items[index];

  const save = () => Alert.alert(
    t('viewer.saved'),
    t('viewer.savedNote'),
  );

  const shareOut = async () => {
    if (!current?.uri) return;
    // Leaves the app entirely.  Nothing here follows it.
    await Share.share({ url: current.uri, message: current.name ?? '' });
  };

  const body = (a: Attachment) => {
    if (a.locality === 'fetching') {
      return <Text style={[typography.body, styles.msg, styles.onDark]}>{t('viewer.fetching')}</Text>;
    }
    if (a.locality === 'unreachable') {
      return (
        <Text style={[typography.body, styles.msg, styles.onDark]}>
          {t('viewer.unreachable')}
        </Text>
      );
    }
    if ((a.type === 'image' || a.type === 'video') && a.uri) {
      return <Image source={{ uri: a.uri }} style={{ width, height: height * 0.7 }} resizeMode="contain" />;
    }
    return (
      <Text style={[typography.body, styles.msg, styles.onDark]}>
        {a.name ? `${a.name}\n\n` : ''}
        {t('viewer.unsupported')}
      </Text>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.chrome}>
        <IconButton name="close-outline" size={24} color={ON_DARK}
          accessibilityLabel={t('common.close')} onPress={() => navigation.goBack()} />
        <Text style={[typography.small, styles.onDark]} numberOfLines={1}>
          {current?.name ?? ''}
        </Text>
        <View style={styles.chromeRight}>
          <IconButton name="download-outline" size={22} color={ON_DARK}
            accessibilityLabel={t('viewer.save')} onPress={save} />
          <IconButton name="share-outline" size={22} color={ON_DARK}
            accessibilityLabel={t('viewer.share')} onPress={shareOut} />
        </View>
      </View>

      {error ? <Banner message={error} /> : null}

      <FlatList
        data={items}
        horizontal
        pagingEnabled
        initialScrollIndex={index}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        keyExtractor={a => a.id}
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={e => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
        renderItem={({ item }) => <View style={[styles.page, { width }]}>{body(item)}</View>}
      />

      {current ? (
        <View style={styles.footer}>
          <IconButton name="chatbubble-outline" size={20} color={ON_DARK}
            accessibilityLabel={t('viewer.goToMessage')}
            onPress={() => navigation.navigate('ChatInterface', { strandId, anchorMessageId: current.messageId })} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // Deliberately not a theme token: media reads better on a dark ground in
  // either theme, and this screen is the image, not the app.
  container: { flex: 1, backgroundColor: '#0b0d0e' },
  onDark: { color: ON_DARK },
  chrome: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing[2], gap: spacing[2] },
  chromeRight: { flexDirection: 'row' },
  page: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing[3] },
  msg: { textAlign: 'center', lineHeight: 22 },
  footer: { alignItems: 'center', padding: spacing[2] },
});
