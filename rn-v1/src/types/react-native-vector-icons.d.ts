declare module 'react-native-vector-icons/Ionicons' {
  import * as React from 'react';
  import { StyleProp, TextStyle } from 'react-native';

  export interface IconProps {
    name: string;
    size?: number;
    color?: string;
    style?: StyleProp<TextStyle>;
    onPress?: () => void;
    accessibilityLabel?: string;
  }

  const Ionicons: React.ComponentType<IconProps>;
  export default Ionicons;
}


