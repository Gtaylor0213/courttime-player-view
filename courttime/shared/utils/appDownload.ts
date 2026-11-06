/**
 * Store links and device detection for the "get the app" prompt and the
 * `/get-app` smart link (one URL for emails and flyers that sends each phone
 * to its own store).
 */
export const APP_STORE_ID = '6826902090';
export const ANDROID_PACKAGE = 'com.courttime.player';

export const APP_STORE_URL = `https://apps.apple.com/app/id${APP_STORE_ID}`;
export const PLAY_STORE_URL = `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`;
export const GET_APP_PATH = '/get-app';

export type DevicePlatform = 'ios' | 'android' | 'desktop';

/**
 * `maxTouchPoints` is only known in the browser: iPadOS Safari reports a Mac
 * user agent by default, and a touch screen is what gives it away.
 */
export function detectDevicePlatform(userAgent: string, maxTouchPoints = 0): DevicePlatform {
  const ua = userAgent || '';
  if (/android/i.test(ua)) return 'android';
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
  if (/macintosh/i.test(ua) && maxTouchPoints > 1) return 'ios';
  return 'desktop';
}

export function storeUrlFor(platform: DevicePlatform): string | null {
  if (platform === 'ios') return APP_STORE_URL;
  if (platform === 'android') return PLAY_STORE_URL;
  return null;
}

/** "Not now" hides the prompt for this long. */
export const APP_PROMPT_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

export interface AppPromptDismissal {
  /** "I already have it" — never ask on this device again. */
  dismissed: boolean;
  /** Epoch ms; the prompt stays hidden until then. */
  snoozedUntil: number | null;
}

export function isAppPromptSuppressed(state: AppPromptDismissal, now: number): boolean {
  if (state.dismissed) return true;
  return state.snoozedUntil != null && now < state.snoozedUntil;
}
