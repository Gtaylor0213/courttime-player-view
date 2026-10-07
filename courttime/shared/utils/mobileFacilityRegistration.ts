/** Deep links for facility registration started from the CourtTime mobile app. */
const SCHEME = 'courttime';

export const MOBILE_FACILITY_REGISTRATION_SOURCE = 'mobile';

export function isMobileFacilityRegistrationSource(
  source: string | null | undefined
): boolean {
  return source === MOBILE_FACILITY_REGISTRATION_SOURCE;
}

export function facilityRegistrationCompleteDeepLink(params: {
  token: string;
  facilityId: string;
}): string {
  const query = new URLSearchParams({
    token: params.token,
    facilityId: params.facilityId,
  });
  return `${SCHEME}://auth/register-facility-complete?${query.toString()}`;
}
