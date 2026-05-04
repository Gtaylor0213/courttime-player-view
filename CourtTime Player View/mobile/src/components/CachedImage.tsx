import { memo } from 'react';
import { StyleProp, ViewStyle, ImageStyle } from 'react-native';
import { Image, type ImageContentFit } from 'expo-image';

interface CachedImageProps {
  uri: string;
  style?: StyleProp<ImageStyle>;
  containerStyle?: StyleProp<ViewStyle>;
  contentFit?: ImageContentFit;
  transition?: number;
}

function CachedImageBase({
  uri,
  style,
  containerStyle,
  contentFit = 'cover',
  transition = 120,
}: CachedImageProps) {
  return (
    <Image
      source={{ uri, cacheKey: uri }}
      style={style}
      contentFit={contentFit}
      transition={transition}
      cachePolicy="memory-disk"
      recyclingKey={uri}
      placeholder={null}
      accessibilityIgnoresInvertColors
      containerStyle={containerStyle}
    />
  );
}

export const CachedImage = memo(CachedImageBase);
