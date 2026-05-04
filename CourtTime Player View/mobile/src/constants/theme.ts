/**
 * CourtTime Design Tokens
 * Shared colors and spacing for consistent UI
 */
import { Appearance } from 'react-native';

const LightColors = {
  // Mirrors web `--primary: oklch(0.55 0.22 150)`
  primary: '#24764D',
  primaryLight: '#2D8E5C',
  primaryDark: '#1D6642',
  secondary: '#ECF5EF',
  accent: '#E8F3EC',

  background: '#FFFFFF',
  surface: '#F1F5F9',
  card: '#FFFFFF',

  text: '#0F172A',
  textSecondary: '#33423C',
  textMuted: '#5F6B66',
  textInverse: '#FFFFFF',

  border: '#D9DEDB',
  borderLight: '#EEF2F0',
  inputBackground: '#F3F3F5',

  success: '#24764D',
  error: '#D4183D',
  warning: '#B7791F',
  info: '#0EA5E9',
  destructive: '#D4183D',
  ring: '#24764D',
  overlay: 'rgba(15, 23, 42, 0.5)',
  purple: '#A855F7',
  cyan: '#0EA5E9',

  courtAvailable: '#24764D',
  courtMaintenance: '#B7791F',
  courtClosed: '#D4183D',
  shadow: 'rgba(15, 23, 42, 0.12)',
  /** Android notification channel LED accent (legacy brand green) */
  androidNotificationLed: '#1a5f2a',
};

const DarkColors: typeof LightColors = {
  primary: '#8CD4AE',
  primaryLight: '#A4E4C0',
  primaryDark: '#69B38B',
  secondary: '#2A3431',
  accent: '#2A3431',

  background: '#171A19',
  surface: '#202524',
  card: '#1D2221',

  text: '#F8FAFC',
  textSecondary: '#D6DEDA',
  textMuted: '#AAB5B0',
  textInverse: '#171A19',

  border: '#39423F',
  borderLight: '#2A3431',
  inputBackground: '#2A3431',

  success: '#8CD4AE',
  error: '#F1637D',
  warning: '#E4B15A',
  info: '#38BDF8',
  destructive: '#F1637D',
  ring: '#8CD4AE',
  overlay: 'rgba(0, 0, 0, 0.55)',
  purple: '#C084FC',
  cyan: '#38BDF8',

  courtAvailable: '#8CD4AE',
  courtMaintenance: '#E4B15A',
  courtClosed: '#F1637D',
  shadow: 'rgba(0, 0, 0, 0.35)',
  androidNotificationLed: '#1a5f2a',
};

export const Colors = Appearance.getColorScheme() === 'dark' ? DarkColors : LightColors;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 20,
  xl: 28,
  xxl: 40,
};

export const FontSize = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 20,
  xxl: 24,
  title: 32,
};

export const BorderRadius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 18,
  full: 999,
};

export const FontFamily = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semiBold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
};

export const Motion = {
  quick: 150,
  standard: 200,
};

export const TouchTarget = {
  min: 48,
};
