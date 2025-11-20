declare module '@react-native-clipboard/clipboard' {
  const Clipboard: { setString: (text: string) => void; getString?: () => Promise<string> };
  export default Clipboard;
}

declare module 'react-native-qrcode-svg' {
  import * as React from 'react';
  export interface QRCodeProps {
    value: string;
    size?: number;
    color?: string;
    backgroundColor?: string;
    getRef?: (c: any) => void;
  }
  export default class QRCode extends React.PureComponent<QRCodeProps> {}
}


