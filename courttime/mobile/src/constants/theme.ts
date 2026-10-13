/**
 * CourtTime Design Tokens
 * Shared colors and spacing for consistent UI
 *
 * Every visual value comes from shared/constants/designTokens.ts, which is a
 * checked copy of the website's values. Add a colour there, not here.
 */
import {
  fontSize,
  headerGradient,
  motion,
  palette,
  radius,
  shadow,
  webTokens,
} from '../../../shared/constants/designTokens';

/**
 * The website's Tailwind palette, for tints the semantic `Colors` don't name
 * (alert backgrounds, status badges). Use it as the site does: `Palette.red50`
 * where the site writes `bg-red-50`.
 */
export const Palette = palette;

/** Top header + bottom tab bar: matches the web sidebar header's `from-green-700 to-green-800` gradient. */
const Chrome = {
  chromeBackground: palette.green800,
  chromeBorder: 'rgba(255,255,255,0.12)',
  chromeText: '#FFFFFF',
  chromeTextMuted: 'rgba(255,255,255,0.65)',
  chromeAccent: '#FFFFFF',
  chromeChipBg: 'rgba(255,255,255,0.16)',
  chromeChipBorder: 'rgba(255,255,255,0.22)',
};

/**
 * Light only, like the website (its `.dark` tokens are never switched on).
 */
export const Colors = {
  ...Chrome,
  // green-700, not the web `--primary` (#00910f): that one is 4.15:1 on white
  // and fails WCAG AA for button labels and links. green-700 is 4.95:1.
  primary: palette.green700,
  primaryLight: palette.green600,
  primaryDark: palette.green800,
  secondary: webTokens.secondary,
  secondaryForeground: webTokens.secondaryForeground,
  accent: webTokens.accent,

  background: webTokens.background,
  surface: palette.gray50,
  card: webTokens.card,

  text: webTokens.foreground,
  textSecondary: palette.gray600,
  textMuted: webTokens.mutedForeground,
  textInverse: '#FFFFFF',

  // Solid stand-in for the web `--border: rgba(0,0,0,0.1)`; screens append
  // alpha suffixes to these, which only works on a hex value.
  border: palette.gray200,
  borderLight: palette.gray100,
  inputBackground: webTokens.inputBackground,

  success: palette.green700,
  error: webTokens.destructive,
  warning: palette.amber700,
  info: palette.blue700,
  destructive: webTokens.destructive,
  ring: palette.green600,
  overlay: 'rgba(0, 0, 0, 0.5)',
  purple: palette.purple600,
  cyan: palette.cyan700,

  courtAvailable: palette.green700,
  courtMaintenance: palette.amber700,
  courtClosed: webTokens.destructive,
  shadow: `rgba(0, 0, 0, ${shadow.sm.opacity})`,
  /** Android notification channel LED accent (legacy brand green) */
  androidNotificationLed: '#1a5f2a',
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 20,
  xl: 28,
  xxl: 40,
};

export const FontSize = {
  xs: fontSize.xs,
  sm: fontSize.sm,
  md: fontSize.base,
  lg: fontSize.lg,
  xl: fontSize.xl,
  xxl: fontSize['2xl'],
  title: fontSize['3xl'],
};

export const BorderRadius = {
  sm: radius.sm,
  md: radius.md,
  lg: radius.lg,
  xl: radius.xl,
  full: 999,
};

export const FontFamily = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semiBold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
};

export const Motion = {
  quick: motion.fastMs,
  standard: motion.standardMs,
};

export const TouchTarget = {
  min: 48,
};

/** The web `shadow-sm` / `shadow-md` / `shadow-lg`, as React Native style props. */
export const Shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: shadow.sm.x, height: shadow.sm.y },
    shadowOpacity: shadow.sm.opacity,
    shadowRadius: shadow.sm.blur,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: shadow.md.x, height: shadow.md.y },
    shadowOpacity: shadow.md.opacity,
    shadowRadius: shadow.md.blur,
    elevation: 3,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: shadow.lg.x, height: shadow.lg.y },
    shadowOpacity: shadow.lg.opacity,
    shadowRadius: shadow.lg.blur,
    elevation: 6,
  },
} as const;

/** `expo-linear-gradient` color stops — obvious, saturated bands (not subtle token tweaks). */
export const Gradients = {
  /** Home welcome card — the site's header green (web: `from-green-700 to-green-800`). */
  homeHero: headerGradient,
  /** Header + bottom tab bar — matches the web sidebar header's `from-green-700 to-green-800`. */
  chrome: headerGradient,
  /** Book screen backdrop — web `bg-green-50` fading to the page white. */
  bookCalendar: [palette.green50, '#FFFFFF', '#FFFFFF'] as const,
} as const;
