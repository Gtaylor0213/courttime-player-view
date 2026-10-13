/**
 * CourtTime design tokens — the website's visual values, in a form the mobile
 * app can read.
 *
 * The WEBSITE is the source of truth. Every value here is copied from one of:
 *   - src/index.css                      (the site's own `:root` tokens)
 *   - node_modules/tailwindcss/theme.css (the Tailwind palette the site's
 *                                         `text-gray-600`, `bg-green-50`, …
 *                                         classes resolve to)
 * `__tests__/designTokens.test.ts` re-reads both files and fails if a value
 * here no longer matches, so the two cannot drift apart silently.
 *
 * The site writes most colours as `oklch(...)`; React Native needs sRGB, so
 * they are stored here as the hex a browser renders for them.
 */

/** Tailwind palette steps the website uses. Source: tailwindcss/theme.css `--color-*`. */
export const palette = {
  green50: '#f0fdf4',
  green100: '#dcfce7',
  green200: '#b9f8cf',
  green300: '#7bf1a8',
  green600: '#00a63e',
  green700: '#008236',
  green800: '#016630',
  gray50: '#f9fafb',
  gray100: '#f3f4f6',
  gray200: '#e5e7eb',
  gray300: '#d1d5dc',
  gray500: '#6a7282',
  gray600: '#4a5565',
  gray900: '#101828',
  amber50: '#fffbeb',
  amber100: '#fef3c6',
  amber200: '#fee685',
  amber700: '#bb4d00',
  amber900: '#7b3306',
  red50: '#fef2f2',
  red100: '#ffe2e2',
  red200: '#ffc9c9',
  red300: '#ffa2a2',
  red600: '#e7000b',
  red700: '#c10007',
  red800: '#9f0712',
  red900: '#82181a',
  yellow100: '#fef9c2',
  yellow800: '#894b00',
  blue50: '#eff6ff',
  blue700: '#1447e6',
  purple50: '#faf5ff',
  purple600: '#9810fa',
  cyan700: '#007595',
} as const;

/** The website's own tokens. Source: src/index.css `:root`. */
export const webTokens = {
  background: '#ffffff',
  foreground: '#0a0a0a',
  card: '#ffffff',
  /**
   * The site's button green. 4.15:1 against white, which is under the 4.5:1
   * WCAG AA needs for text, so the app uses `palette.green700` (4.95:1)
   * wherever green carries text. Kept here for reference and for the drift test.
   */
  primary: '#00910f',
  primaryForeground: '#ffffff',
  secondary: '#e6f3e8',
  secondaryForeground: '#021c09',
  muted: '#eef2f0',
  mutedForeground: '#5f6b66',
  accent: '#dbeede',
  destructive: '#d4183d',
  destructiveForeground: '#ffffff',
  /** `rgba(0, 0, 0, 0.1)` on the site; `palette.gray200` is its solid twin. */
  border: 'rgba(0, 0, 0, 0.1)',
  inputBackground: '#f3f3f5',
  switchBackground: '#cbced4',
  calendarUnavailableStripeA: '#e8eeeb',
  calendarUnavailableStripeB: '#d6e0db',
} as const;

/** Source: src/index.css `--radius: 0.625rem` and the `@theme` radius steps derived from it. */
export const radius = {
  sm: 6,
  md: 8,
  lg: 10,
  xl: 14,
} as const;

/** Source: Tailwind's `text-*` steps the site uses (px at the site's 16px root). */
export const fontSize = {
  xs: 12,
  sm: 14,
  base: 16,
  lg: 18,
  xl: 20,
  '2xl': 24,
  '3xl': 30,
} as const;

/** Source: src/index.css `--motion-fast`, `--motion-standard`, `--ease-standard`. */
export const motion = {
  fastMs: 150,
  standardMs: 220,
  easeStandard: [0.2, 0.8, 0.2, 1],
} as const;

/**
 * Source: Tailwind's `shadow-sm` / `shadow-md` / `shadow-lg` (first layer of
 * each), which is what the site's cards, hovers and dialogs use.
 */
export const shadow = {
  sm: { x: 0, y: 1, blur: 3, opacity: 0.1 },
  md: { x: 0, y: 4, blur: 6, opacity: 0.1 },
  lg: { x: 0, y: 10, blur: 15, opacity: 0.1 },
} as const;

/** Source: the site's header, `bg-gradient-to-r from-green-700 to-green-800` (AboutPage, UnifiedSidebar). */
export const headerGradient = [palette.green700, palette.green800] as const;
