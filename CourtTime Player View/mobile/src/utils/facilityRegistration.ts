import { Linking } from 'react-native';
import { stripTrailingSlashes } from '../config/runtime';

const FACILITY_REGISTRATION_PATH = '/register/facility';
const DEFAULT_DEV_WEB_PORT = '5173';

function normalizeBaseUrl(url: string | null | undefined): string | null {
  if (typeof url !== 'string') return null;
  const trimmed = url.trim();
  return trimmed.length > 0 ? stripTrailingSlashes(trimmed) : null;
}

/**
 * Maps the mobile API base URL to the Vite web app origin used for facility registration.
 * Override with EXPO_PUBLIC_WEB_URL when the web app is hosted separately from the API.
 */
export function resolveWebAppBaseUrl(
  apiBaseUrl: string,
  explicitWebUrl?: string | null
): string {
  const explicit = normalizeBaseUrl(explicitWebUrl);
  if (explicit) return explicit;

  const api = stripTrailingSlashes(apiBaseUrl);
  const withoutApiSuffix = api.replace(/\/api$/i, '');

  // Local Express API -> Vite dev server (same host, port 5173).
  if (/:3001$/i.test(withoutApiSuffix)) {
    return withoutApiSuffix.replace(/:3001$/i, `:${DEFAULT_DEV_WEB_PORT}`);
  }

  // Production / preview: web and API share the same public host.
  return withoutApiSuffix;
}

export function getFacilityRegistrationUrl(
  apiBaseUrl: string,
  explicitWebUrl?: string | null
): string {
  const base = resolveWebAppBaseUrl(apiBaseUrl, explicitWebUrl);
  return `${base}${FACILITY_REGISTRATION_PATH}`;
}

export async function openFacilityRegistration(registrationUrl: string): Promise<boolean> {
  try {
    const canOpen = await Linking.canOpenURL(registrationUrl);
    if (!canOpen) return false;
    await Linking.openURL(registrationUrl);
    return true;
  } catch {
    return false;
  }
}
