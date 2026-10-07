/**
 * Default Inter regular on all Text nodes. Styles that set fontFamily override this.
 * Import once from the app root (see app/_layout.tsx).
 */
import { Text } from 'react-native';
import { FontFamily } from './constants/theme';

type TextWithDefaults = typeof Text & {
  defaultProps?: { style?: unknown };
};

const RNText = Text as TextWithDefaults;

RNText.defaultProps = {
  ...RNText.defaultProps,
  style: [{ fontFamily: FontFamily.regular }, RNText.defaultProps?.style].flat().filter(Boolean),
};
