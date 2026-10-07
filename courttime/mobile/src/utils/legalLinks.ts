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
 * These are digital services, which App Store Guideline 3.1.1 requires to go
 * through in-app purchase, so the iOS app shows their status but never starts
 * a purchase. Member payments to a club (court fees, dues, pro shop) are
 * real-world services and are unaffected.
 */
export const PLATFORM_BILLING_IN_APP = Platform.OS !== 'ios';
