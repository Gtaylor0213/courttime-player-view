import { describe, expect, it } from 'vitest';
import {
  formatSignupFee,
  isPaidSignupPost,
  mapPostFromApi,
} from '../bulletinPostDisplay';

describe('bulletinPostDisplay', () => {
  it('detects paid signup posts', () => {
    expect(isPaidSignupPost({ requirePayment: true, signupAmountCents: 1500 })).toBe(true);
    expect(isPaidSignupPost({ requirePayment: false, signupAmountCents: 1500 })).toBe(false);
    expect(isPaidSignupPost({ signupAmountCents: 0 })).toBe(false);
  });

  it('formats signup fee', () => {
    expect(formatSignupFee(2500)).toBe('$25.00');
    expect(formatSignupFee(null)).toBe('');
  });

  it('maps API post shape', () => {
    const view = mapPostFromApi({
      id: 'p1',
      title: 'Clinic',
      content: 'Details',
      category: 'clinic',
      facilityId: 'f1',
      signupAmountCents: 1000,
      requirePayment: true,
    });
    expect(view.type).toBe('clinic');
    expect(view.signupAmountCents).toBe(1000);
    expect(view.requirePayment).toBe(true);
  });
});
