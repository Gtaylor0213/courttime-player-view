import { describe, expect, it } from '@jest/globals';
import {
  courtBallMachineFeeCents,
  courtGuestFeeCents,
  courtRequiresPayment,
} from '../src/utils/payments';

describe('courtRequiresPayment', () => {
  it('is false when the court does not require payment at all', () => {
    expect(courtRequiresPayment({ requirePayment: false, bookingAmountCents: 4000 })).toBe(false);
    expect(courtRequiresPayment({})).toBe(false);
  });

  it('reads the hourly amount by default', () => {
    expect(courtRequiresPayment({ requirePayment: true, bookingAmountCents: 4000 })).toBe(true);
    expect(courtRequiresPayment({ requirePayment: true, bookingAmountCents: 0 })).toBe(false);
  });

  it('reads the daily rate for a court billed daily', () => {
    // The bug this covers: a daily-rate court carries no hourly amount, so it
    // read as free and the app offered "Confirm Booking" on a paid reservation.
    expect(
      courtRequiresPayment({
        requirePayment: true,
        billingMode: 'daily',
        dailyRateCents: 9000,
        bookingAmountCents: 0,
      })
    ).toBe(true);
  });

  it('is false for a daily court with no day rate set', () => {
    expect(
      courtRequiresPayment({
        requirePayment: true,
        billingMode: 'daily',
        dailyRateCents: 0,
        bookingAmountCents: 4000,
      })
    ).toBe(false);
  });

  it('ignores the hourly amount when billing daily', () => {
    expect(
      courtRequiresPayment({
        requirePayment: true,
        billingMode: 'daily',
        dailyRateCents: null,
        bookingAmountCents: 4000,
      })
    ).toBe(false);
  });

  it('treats an explicit hourly mode like the default', () => {
    expect(
      courtRequiresPayment({
        requirePayment: true,
        billingMode: 'hourly',
        bookingAmountCents: 4000,
        dailyRateCents: 0,
      })
    ).toBe(true);
  });
});

describe('courtGuestFeeCents', () => {
  it('returns the fee when set', () => {
    expect(courtGuestFeeCents({ guestFeeCents: 1500 })).toBe(1500);
  });

  it('returns null when absent or zero', () => {
    expect(courtGuestFeeCents({ guestFeeCents: 0 })).toBeNull();
    expect(courtGuestFeeCents({})).toBeNull();
  });
});

describe('courtBallMachineFeeCents', () => {
  it('returns the fee when set', () => {
    expect(courtBallMachineFeeCents({ ballMachineFeeCents: 800 })).toBe(800);
  });

  it('returns null when absent or zero', () => {
    expect(courtBallMachineFeeCents({ ballMachineFeeCents: null })).toBeNull();
  });
});
