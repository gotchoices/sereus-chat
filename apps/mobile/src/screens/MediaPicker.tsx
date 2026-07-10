import React from 'react';
import { View, Text, StyleSheet, Modal, Pressable } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { launchCamera, launchImageLibrary, Asset } from 'react-native-image-picker';
import { pick, keepLocalCopy } from '@react-native-documents/picker';
import { setPendingAttachment, type ProvisionalAttachment } from '../data/attachmentDraft';
import { useNavigation } from '@react-navigation/native';
import { useT } from '../i18n';
import { ListRow, IconButton } from '../components';
import { useTheme, typography, spacing, radius } from '../theme';

type Props = {
  visible?: boolean;
  onClose?: () => void;
  onPick?: (type: 'image' | 'video' | 'file' | 'location') => void;
};

export default function MediaPicker(props: Props) {
  const { visible = true, onClose, onPick } = props;
  const navigation: any = useNavigation();
  const t = useT();
  const theme = useTheme();

  const close = () => {
    onClose?.();
    navigation.goBack();
  };

  const handlePicked = (att: ProvisionalAttachment) => {
    setPendingAttachment(att);
    onPick?.(att.type);
    close();
  };

  const pickFromGallery = async () => {
    const res = await launchImageLibrary({ mediaType: 'photo', selectionLimit: 1 });
    const a: Asset | undefined = res.assets?.[0];
    if (a?.uri) {
      handlePicked({
        id: `att-${Date.now()}`,
        type: 'image',
        uri: a.uri,
        mimeType: a.type ?? undefined,
        name: a.fileName ?? undefined,
        size: a.fileSize ?? undefined,
      });
    } else {
      close();
    }
  };

  const pickFromCamera = async () => {
    const res = await launchCamera({ mediaType: 'photo' });
    const a: Asset | undefined = res.assets?.[0];
    if (a?.uri) {
      handlePicked({
        id: `att-${Date.now()}`,
        type: 'image',
        uri: a.uri,
        mimeType: a.type ?? undefined,
        name: a.fileName ?? undefined,
        size: a.fileSize ?? undefined,
      });
    } else {
      close();
    }
  };

  const pickFile = async () => {
    try {
      const [file] = await pick({ mode: 'import' });
      if (file?.uri) {
        const [local] = await keepLocalCopy({
          files: [{ uri: file.uri, fileName: file.name ?? 'file' }],
          destination: 'documentDirectory',
        });
        handlePicked({
          id: `att-${Date.now()}`,
          type: 'file',
          uri: local?.uri ?? file.uri,
          name: file.name ?? undefined,
          size: file.size ?? undefined,
          mimeType: file.type ?? undefined,
        });
      } else {
        close();
      }
    } catch {
      close();
    }
  };

  const leading = (name: string) => (
    <Ionicons name={name} size={22} color={theme.accent} />
  );

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={[styles.backdrop, { backgroundColor: theme.overlay }]}
        onPress={close}
        testID="media-picker-backdrop"
      >
        <View />
      </Pressable>
      <View
        style={[styles.sheet, { backgroundColor: theme.surface, borderTopColor: theme.divider }]}
        testID="media-picker"
      >
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.textPrimary }]}>
            {t('screens.mediaPicker.title', 'Attach')}
          </Text>
          <IconButton
            name="close"
            size={22}
            variant="plain"
            onPress={close}
            accessibilityLabel={t('screens.mediaPicker.close', 'Close picker')}
            testID="media-close"
          />
        </View>

        <ListRow
          title={t('screens.mediaPicker.camera', 'Camera')}
          leading={leading('camera-outline')}
          onPress={pickFromCamera}
          testID="media-camera"
        />
        <ListRow
          title={t('screens.mediaPicker.gallery', 'Gallery')}
          leading={leading('images-outline')}
          onPress={pickFromGallery}
          testID="media-gallery"
        />
        <ListRow
          title={t('screens.mediaPicker.file', 'File')}
          leading={leading('document-outline')}
          onPress={pickFile}
          testID="media-file"
        />
        <ListRow
          title={t('screens.mediaPicker.location', 'Location')}
          leading={leading('location-outline')}
          onPress={() => onPick?.('location')}
          testID="media-location"
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing[3],
    paddingTop: spacing[2],
    paddingBottom: spacing[5],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing[2],
  },
  title: { ...typography.title },
});
