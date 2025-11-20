import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Pressable } from 'react-native';
import { launchCamera, launchImageLibrary, Asset } from 'react-native-image-picker';
import { pick, keepLocalCopy } from '@react-native-documents/picker';
import { setPendingAttachment, type ProvisionalAttachment } from '../data/attachmentDraft';
import { useNavigation } from '@react-navigation/native';

type Props = {
  visible?: boolean;
  onClose?: () => void;
  onPick?: (type: 'image' | 'video' | 'file' | 'location') => void;
};

export default function MediaPicker(props: Props) {
  const { visible = true, onClose, onPick } = props;
  const navigation: any = useNavigation();

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
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} android_ripple={{ color: '#00000020' }} onPress={close} testID="media-picker-backdrop">
        <View />
      </Pressable>
      <View style={styles.sheet} testID="media-picker">
        <Text style={styles.title}>Attach</Text>
        <View style={styles.row}>
          <PickerButton label="Camera" onPress={pickFromCamera} testID="media-camera" />
          <PickerButton label="Gallery" onPress={pickFromGallery} testID="media-gallery" />
        </View>
        <View style={styles.row}>
          <PickerButton label="File" onPress={pickFile} testID="media-file" />
          <PickerButton label="Location" onPress={() => onPick?.('location')} testID="media-location" />
        </View>
        <TouchableOpacity style={styles.close} onPress={close} accessibilityLabel="Close picker" testID="media-close">
          <Text style={styles.closeText}>Close</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

function PickerButton({ label, onPress, testID }: { label: string; onPress: () => void; testID?: string }) {
  return (
    <TouchableOpacity style={styles.btn} onPress={onPress} accessibilityRole="button" testID={testID}>
      <Text style={styles.btnText}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  sheet: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 24,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    elevation: 6,
  },
  title: { fontSize: 16, fontWeight: '600', marginBottom: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  btn: {
    flex: 1,
    marginHorizontal: 6,
    backgroundColor: '#f4f4f4',
    paddingVertical: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: { fontSize: 14, fontWeight: '500' },
  close: { alignSelf: 'flex-end', paddingVertical: 8, paddingHorizontal: 12, marginTop: 8 },
  closeText: { color: '#0066cc', fontWeight: '600' },
});


