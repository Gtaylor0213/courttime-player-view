/**
 * CourtTime Design Tokens
 * Shared colors and spacing for consistent UI
 */
import { Appearance } from 'react-native';

/** Top tab bar + headers: dark evergreen chrome (same in light/dark for a bold, app-like shell). */
const Chrome = {
  chromeBackground: '#061912',
  chromeBorder: 'rgba(255,255,255,0.08)',
  chromeText: '#F2FFF7',
  chromeTextMuted: 'rgba(242,255,247,0.52)',
  chromeAccent: '#8FFFD4',
  chromeChipBg: 'rgba(255,255,255,0.12)',
  chromeChipBorder: 'rgba(255,255,255,0.18)',
};

const LightColors = {
  ...Chrome,
  // Mirrors web `--primary: oklch(0.55 0.22 150)` — slightly richer for mobile contrast
  primary: '#1F6B47',
  primaryLight: '#2A8A5C',
  primaryDark: '#185A3C',
  secondary: '#E4F0EA',
  accent: '#D4EAD9',

  background: '#FAFCFA',
  surface: '#EEF4F0',
  card: '#FFFFFF',

  text: '#0C1628',
  textSecondary: '#2D3D36',
  textMuted: '#5C6A63',
  textInverse: '#FFFFFF',

  border: '#D5DED8',
  borderLight: '#E8EFE9',
  inputBackground: '#F2F6F3',

  success: '#1F6B47',
  error: '#D4183D',
  warning: '#B7791F',
  info: '#0EA5E9',
  destructive: '#D4183D',
  ring: '#1F6B47',
  overlay: 'rgba(15, 23, 42, 0.5)',
  purple: '#A855F7',
  cyan: '#0EA5E9',

  courtAvailable: '#1F6B47',
  courtMaintenance: '#B7791F',
  courtClosed: '#D4183D',
  shadow: 'rgba(15, 23, 42, 0.08)',
  /** Android notification channel LED accent (legacy brand green) */
  androidNotificationLed: '#1a5f2a',
};

const DarkColors: typeof LightColors = {
  ...Chrome,
  primary: '#7FD4A8',
  primaryLight: '#9AE4BC',
  primaryDark: '#5FB88A',
  secondary: '#24302C',
  accent: '#2A3833',

  background: '#121816',
  surface: '#1A211E',
  card: '#1E2623',

  text: '#F4FAF7',
  textSecondary: '#CDD8D3',
  textMuted: '#9DAAA4',
  textInverse: '#121816',

  border: '#35403B',
  borderLight: '#28332F',
  inputBackground: '#252E2A',

  success: '#7FD4A8',
  error: '#F1637D',
  warning: '#E4B15A',
  info: '#38BDF8',
  destructive: '#F1637D',
  ring: '#7FD4A8',
  overlay: 'rgba(0, 0, 0, 0.55)',
  purple: '#C084FC',
  cyan: '#38BDF8',

  courtAvailable: '#7FD4A8',
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
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
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

/** `expo-linear-gradient` color stops — obvious, saturated bands (not subtle token tweaks). */
export const Gradients = {
  login: ['#022018', '#0D4D35', '#14805A', '#23B07A'] as const,
  homeHero: ['#031910', '#0F4D36', '#1A7A55', '#2EB87E'] as const,
  tabBar: ['#041510', '#071E18'] as const,
  bookCalendar: ['#DCF5E8', '#F7FDF9', '#FFFFFF'] as const,
} as const;
