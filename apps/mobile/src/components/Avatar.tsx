/**
 * Avatar — circular identity mark.
 *
 * Shows the image when available, else the display-name initial on a fill color
 * hashed from the name (ui.md "Visual conventions").  Sizes: sm (list) / md
 * (header, profile).
 */

import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { avatarColor, avatarInitial } from '../theme';

type Size = 'sm' | 'md' | 'lg';

const DIM: Record<Size, number> = { sm: 40, md: 48, lg: 72 };

export interface AvatarProps {
  name: string;
  uri?: string | null;
  size?: Size;
  testID?: string;
}

export function Avatar({ name, uri, size = 'sm', testID }: AvatarProps) {
  const dim = DIM[size];
  const shape = { width: dim, height: dim, borderRadius: dim / 2 };

  if (uri) {
    return (
      <Image
        testID={testID}
        source={{ uri }}
        style={[styles.base, shape]}
        accessibilityLabel={name}
      />
    );
  }

  return (
    <View
      testID={testID}
      style={[styles.base, shape, { backgroundColor: avatarColor(name) }]}
      accessible
      accessibilityLabel={name}
    >
      <Text style={[styles.initial, { fontSize: dim * 0.42 }]}>{avatarInitial(name)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
  initial: { color: '#ffffff', fontWeight: '600' },
});
