/**
 * The phone's built-in "rate this app" sheet.
 *
 * App 1.0 / 1.0.1 builds don't include the native review module, and adding it
 * changes the app's native fingerprint (so it needs a new store build, not an
 * over-the-air update). Until that build, this reports "not asked" and the
 * 14-day logic in reviewPrompt.ts simply waits. The 1.0.2 build swaps this body
 * for expo-store-review.
 */
export async function requestNativeStoreReview(): Promise<boolean> {
  return false;
}
