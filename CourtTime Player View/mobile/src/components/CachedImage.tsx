import { memo } from 'react';
import { StyleProp, ImageStyle } from 'react-native';
import { Image, type ImageContentFit } from 'expo-image';
import { Colors } from '../constants/theme';

interface CachedImageProps {
  uri: string;
  style?: StyleProp<ImageStyle>;
  contentFit?: ImageContentFit;
  transition?: number;
}

function CachedImageBase({
  uri,
  style,
  contentFit = 'cover',
  transition = 120,
}: CachedImageProps) {
  return (
    <Image
      source={{ uri, cacheKey: uri }}
      style={[{ backgroundColor: Colors.borderLight }, style]}
      contentFit={contentFit}
      transition={transition}
      cachePolicy="memory-disk"
      recyclingKey={uri}
      placeholder={null}
      accessibilityIgnoresInvertColors
    />
  );
}

export const CachedImage = memo(CachedImageBase);
