import { Platform, Alert } from 'react-native';

export function showToast(message: string) {
  if (Platform.OS === 'android') {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { ToastAndroid } = require('react-native');
    ToastAndroid.show(message, ToastAndroid.SHORT);
  } else {
    Alert.alert('', message);
  }
}


