import { Linking, Platform } from 'react-native';
import { showAlert } from './alert';

const WEB_URL = 'https://www.courttimeapp.com';

/** Public legal and support pages. The same URLs are entered in the store listings. */
export const LEGAL_URLS = {
  privacy: `${WEB_URL}/privacy`,
  terms: `${WEB_URL}/terms`,
  support: `${WEB_URL}/support`,
} as const;

export async function openLegalLink(key: keyof typeof LEGAL_URLS): Promise<void> {
  const url = LEGAL_URLS[key];
  try {
    await Linking.openURL(url);
  } catch {
    showAlert('Could not open link', `Please visit ${url} in your browser.`);
  }
}

/**
 * Whether the app may sell CourtTime's own platform billing (the facility
 * subscription, per-court platform fees, facility registration with payment).
 * These are digital services. App Store Guideline 3.1.1 and Google Play's
 * Payments policy both require digital purchases to go through the store's
 * own billing, so the iOS and Android apps show their status but never start
 * a purchase. Member payments to a club (court fees, dues, pro shop) are
 * real-world services and are unaffected.
 */
export const PLATFORM_BILLING_IN_APP = Platform.OS === 'web';
