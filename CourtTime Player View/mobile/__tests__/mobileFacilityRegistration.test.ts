import { describe, expect, it } from '@jest/globals';
import {
  facilityRegistrationCompleteDeepLink,
  isMobileFacilityRegistrationSource,
} from '../../shared/utils/mobileFacilityRegistration';

describe('mobileFacilityRegistration', () => {
  it('detects the mobile registration source flag', () => {
    expect(isMobileFacilityRegistrationSource('mobile')).toBe(true);
    expect(isMobileFacilityRegistrationSource('web')).toBe(false);
    expect(isMobileFacilityRegistrationSource(null)).toBe(false);
  });

  it('builds the post-registration deep link', () => {
    const url = facilityRegistrationCompleteDeepLink({
      token: 'jwt-token',
      facilityId: 'fac-123',
    });
    expect(url).toBe(
      'courttime://auth/register-facility-complete?token=jwt-token&facilityId=fac-123'
    );
  });
});
