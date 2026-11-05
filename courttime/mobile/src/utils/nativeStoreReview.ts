/**
 * The phone's built-in "rate this app" sheet (App Store / Google Play).
 *
 * Apple and Google decide whether it actually appears (Apple: at most 3 times
 * a year, never in TestFlight), so "true" means we asked, not that the member
 * saw it. reviewPrompt.ts handles when to ask.
 */
import * as StoreReview from 'expo-store-review';

export async function requestNativeStoreReview(): Promise<boolean> {
  if (!(await StoreReview.isAvailableAsync())) return false;
  await StoreReview.requestReview();
  return true;
}
