import { MOBILE_FACILITY_REGISTRATION_SOURCE } from '../../../shared/utils/mobileFacilityRegistration';

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
