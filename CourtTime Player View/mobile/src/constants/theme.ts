/**
 * CourtTime Design Tokens
 * Shared colors and spacing for consistent UI
 */
import { Appearance } from 'react-native';

const LightColors = {
  primary: '#2563EB',
  primaryLight: '#3B82F6',
  primaryDark: '#1D4ED8',
  secondary: '#EEF2FF',
  accent: '#14B8A6',

  background: '#F8FAFC',
  surface: '#F1F5F9',
  card: '#ffffff',

  text: '#0F172A',
  textSecondary: '#475569',
  textMuted: '#94A3B8',
  textInverse: '#ffffff',

  border: '#E2E8F0',
  borderLight: '#F1F5F9',

  success: '#16A34A',
  error: '#DC2626',
  warning: '#F59E0B',
  info: '#0EA5E9',

  courtAvailable: '#16A34A',
  courtMaintenance: '#F59E0B',
  courtClosed: '#DC2626',
};

const DarkColors: typeof LightColors = {
  primary: '#60A5FA',
  primaryLight: '#93C5FD',
  primaryDark: '#3B82F6',
  secondary: '#1E293B',
  accent: '#2DD4BF',

  background: '#020617',
  surface: '#0F172A',
  card: '#111827',

  text: '#F8FAFC',
  textSecondary: '#CBD5E1',
  textMuted: '#94A3B8',
  textInverse: '#020617',

  border: '#334155',
  borderLight: '#1E293B',

  success: '#22C55E',
  error: '#F87171',
  warning: '#FBBF24',
  info: '#38BDF8',

  courtAvailable: '#22C55E',
  courtMaintenance: '#FBBF24',
  courtClosed: '#F87171',
};

export const Colors = Appearance.getColorScheme() === 'dark' ? DarkColors : LightColors;

export const Spacing = {
  xs: 4,
  sm: 10,
  md: 16,
  lg: 24,
  xl: 36,
  xxl: 48,
};

export const FontSize = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 22,
  xxl: 28,
  title: 34,
};

export const BorderRadius = {
  sm: 8,
  md: 14,
  lg: 20,
  full: 999,
};
