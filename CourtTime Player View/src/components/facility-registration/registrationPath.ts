import { MOBILE_FACILITY_REGISTRATION_SOURCE } from '../../../shared/utils/mobileFacilityRegistration';
import type { Step1Mode } from './registrationTypes';

export function getRegistrationPathWithMobileSource(isMobile: boolean): string {
  if (!isMobile) return window.location.pathname;
  const params = new URLSearchParams(window.location.search);
  params.set('source', MOBILE_FACILITY_REGISTRATION_SOURCE);
  const query = params.toString();
  return query ? `${window.location.pathname}?${query}` : window.location.pathname;
}

export function parsedHasCreateAccountFields(data: {
  adminEmail?: string;
  adminPassword?: string;
  adminFirstName?: string;
  adminLastName?: string;
}): boolean {
  return !!(
    data.adminEmail?.trim() &&
    data.adminPassword &&
    data.adminFirstName?.trim() &&
    data.adminLastName?.trim()
  );
}

/** Resolve account-step validation from session + live state (Stripe return can lag React state). */
export function resolveRegistrationValidationOptions(
  formData: {
    adminEmail?: string;
    adminPassword?: string;
    adminFirstName?: string;
    adminLastName?: string;
  },
  live: {
    user: { id?: string } | null;
    preAuthenticated: boolean;
    step1Mode: Step1Mode;
    loggedInDuringRegistration: boolean;
  }
): { preAuthenticated: boolean; step1Mode: Step1Mode; existingUserId?: string } {
  if (typeof sessionStorage === 'undefined') {
    return { preAuthenticated: live.preAuthenticated, step1Mode: live.step1Mode, existingUserId: live.user?.id };
  }

  const savedStep1Mode = sessionStorage.getItem('facilityRegistrationStep1Mode');
  const savedLoggedInDuring = sessionStorage.getItem('facilityRegistrationLoggedInDuring') === 'true';
  const loggedInDuring = live.loggedInDuringRegistration || savedLoggedInDuring;
  const preAuthenticated = !!live.user?.id && !loggedInDuring;

  let step1Mode = live.step1Mode;
  if (savedStep1Mode === 'create' || savedStep1Mode === 'login' || savedStep1Mode === 'loggedIn') {
    step1Mode = savedStep1Mode;
  } else if (step1Mode === 'choose' && parsedHasCreateAccountFields(formData)) {
    step1Mode = 'create';
  } else if (loggedInDuring && live.user?.id) {
    step1Mode = 'loggedIn';
  }

  return { preAuthenticated, step1Mode, existingUserId: live.user?.id };
}
