import { describe, expect, it } from 'vitest';
import { unwrapApiPayload } from '../../../shared/api/core';

/**
 * Regression guard for the split-court-payment envelopes.
 *
 * The split routes reply `{ success, data: {...} }` (or `{ success, <field> }`), and
 * buildApiRequest stores the *entire* response body as `.data`. That puts the real
 * payload at `res.data.data`, so ReservationManagementModal reading `res.data.shares`
 * got `undefined` — which rendered "Split payment: 0 of 0 shares paid" and hid the
 * Pay my share / Decline buttons entirely, making a split impossible to complete.
 * bookingApi/rulesApi unwrap once so callers can read `res.data.<field>` directly.
 */

/** What buildApiRequest returns for a 200: the whole JSON body under `.data`. */
function asClientResponse(responseBody: unknown) {
  return { success: true, data: responseBody };
}

/** The unwrap bookingApi/rulesApi apply. */
function unwrapped(res: { success: boolean; data: unknown }) {
  return { ...res, data: unwrapApiPayload<any>(res.data) };
}

describe('split payment API envelope', () => {
  it('exposes the share roster as an array, not undefined', () => {
    // Verbatim body from GET /api/bookings/:bookingId/split-payment
    const raw = asClientResponse({
      success: true,
      data: {
        bookingId: '9b0c39af-d2bc-4f6b-90d6-c9e607eb0d17',
        ownerId: 'b9c1bd70-211d-44bd-9c48-80a111a66dbb',
        status: 'pending',
        paymentDeadlineAt: '2026-08-01T17:52:49.980Z',
        shares: [
          { userId: 'b9c1bd70-211d-44bd-9c48-80a111a66dbb', amountCents: 50, status: 'paid', paidAt: '2026-08-01T15:52:58.758Z', fullName: 'Organizer' },
          { userId: 'bc8722a3-f546-4a82-8f3b-2c188af29800', amountCents: 50, status: 'pending', paidAt: null, fullName: 'Participant' },
        ],
      },
    });

    // Without unwrapping, this is the "0 of 0 shares paid" bug.
    expect((raw.data as any).shares).toBeUndefined();

    const res = unwrapped(raw);
    expect(Array.isArray(res.data.shares)).toBe(true);
    expect(res.data.shares).toHaveLength(2);
    expect(res.data.paymentDeadlineAt).toBe('2026-08-01T17:52:49.980Z');
  });

  it('lets a participant find their own pending share so Pay/Decline render', () => {
    const participantId = 'bc8722a3-f546-4a82-8f3b-2c188af29800';
    const res = unwrapped(
      asClientResponse({
        success: true,
        data: {
          bookingId: 'booking-1',
          ownerId: 'organizer-1',
          status: 'pending',
          shares: [
            { userId: 'organizer-1', amountCents: 50, status: 'paid' },
            { userId: participantId, amountCents: 50, status: 'pending' },
          ],
        },
      })
    );

    const mine = res.data.shares.find((share: any) => share.userId === participantId);
    const paid = res.data.shares.filter((share: any) => share.status === 'paid').length;

    expect(mine?.status).toBe('pending');
    expect(`${paid} of ${res.data.shares.length}`).toBe('1 of 2');
  });

  it('exposes the checkout url used to redirect to Stripe', () => {
    // Verbatim body from POST /api/bookings/:bookingId/split-payment/checkout
    const res = unwrapped(
      asClientResponse({ success: true, checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_test_split' })
    );
    expect(res.data.checkoutUrl).toBe('https://checkout.stripe.com/c/pay/cs_test_split');
  });

  it('exposes the facility split-payment flag as its real boolean', () => {
    // Verbatim body from GET /api/rules/facility/:facilityId/split-court-payments
    const res = unwrapped(asClientResponse({ success: true, enabled: true }));
    expect(res.data.enabled).toBe(true);
  });
});
