/**
 * Asking members for an App Store / Google Play review.
 *
 * - The clock starts the first time the app is opened (recordFirstAppUse).
 * - After REVIEW_PROMPT_MIN_DAYS, the next finished booking asks once, using the
 *   phone's own review sheet. Apple and Google don't allow asking "do you like
 *   it?" first, so there is no question of our own in front of it.
 * - Apple and Google decide whether the sheet actually appears (Apple: at most
 *   3 times a year), so we also hold off REVIEW_PROMPT_REPEAT_DAYS ourselves.
 * - Profile → "Rate CourtTime" opens the store's review page any time.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Linking, Platform } from 'react-native';
import { requestNativeStoreReview } from './nativeStoreReview';

export const REVIEW_PROMPT_MIN_DAYS = 14;
export const REVIEW_PROMPT_REPEAT_DAYS = 120;

export const APP_STORE_ID = '6826902090';
export const ANDROID_PACKAGE = 'com.courttime.player';
export const APP_STORE_REVIEW_URL = `https://apps.apple.com/app/id${APP_STORE_ID}?action=write-review`;
export const PLAY_STORE_REVIEW_URL = `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}&showAllReviews=true`;

export const FIRST_USED_KEY = 'reviewPrompt.firstUsedAt';
export const LAST_ASKED_KEY = 'reviewPrompt.lastAskedAt';

const DAY_MS = 24 * 60 * 60 * 1000;

export function isEligibleForReviewPrompt(input: {
  firstUsedAt: number | null;
  lastAskedAt: number | null;
  now: number;
}): boolean {
  const { firstUsedAt, lastAskedAt, now } = input;
  if (firstUsedAt == null || now - firstUsedAt < REVIEW_PROMPT_MIN_DAYS * DAY_MS) return false;
  return lastAskedAt == null || now - lastAskedAt >= REVIEW_PROMPT_REPEAT_DAYS * DAY_MS;
}

async function readTime(key: string): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    const value = raw == null ? NaN : Number(raw);
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

async function writeTime(key: string, value: number): Promise<void> {
  try {
    await AsyncStorage.setItem(key, String(value));
  } catch {
    // Storage unavailable: worst case we ask again later, which the OS also limits.
  }
}

/** Call on every app start; only the first one is kept. */
export async function recordFirstAppUse(now = Date.now()): Promise<void> {
  if ((await readTime(FIRST_USED_KEY)) == null) await writeTime(FIRST_USED_KEY, now);
}

/** Call after a booking succeeds and its confirmation is closed. Never throws. */
export async function maybeAskForReview(now = Date.now()): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const [firstUsedAt, lastAskedAt] = await Promise.all([readTime(FIRST_USED_KEY), readTime(LAST_ASKED_KEY)]);
    if (!isEligibleForReviewPrompt({ firstUsedAt, lastAskedAt, now })) return false;
    const asked = await requestNativeStoreReview();
    if (asked) await writeTime(LAST_ASKED_KEY, now);
    return asked;
  } catch {
    return false;
  }
}

export function storeReviewUrl(platform: string = Platform.OS): string | null {
  if (platform === 'ios') return APP_STORE_REVIEW_URL;
  if (platform === 'android') return PLAY_STORE_REVIEW_URL;
  return null;
}

/** Profile → "Rate CourtTime". */
export async function openStoreReviewPage(): Promise<void> {
  const url = storeReviewUrl();
  if (url) await Linking.openURL(url);
}
