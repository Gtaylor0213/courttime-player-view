import { beforeEach, describe, expect, it, vi } from 'vitest';

const queryMock = vi.fn();
const refundsCreateMock = vi.fn();

vi.mock('../../database/connection', () => ({
  query: (...args: unknown[]) => queryMock(...args),
}));

vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_split_payment_refund');

vi.mock('stripe', () => ({
  default: vi.fn().mockImplementation(() => ({
    refunds: { create: refundsCreateMock },
  })),
}));

import { refundSplitPaymentShares } from '../stripeConnectService';

describe('refundSplitPaymentShares', () => {
  beforeEach(() => {
    queryMock.mockReset();
    refundsCreateMock.mockReset();
    refundsCreateMock.mockResolvedValue({ id: 're_split_1' });
  });

  it('returns zeros when Stripe is not configured', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_xxxx');

    const summary = await refundSplitPaymentShares('booking-1');

    expect(summary).toEqual({ refunded: 0, skipped: 0, failed: 0 });
    expect(queryMock).not.toHaveBeenCalled();

    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_split_payment_refund');
  });

  it('refunds every paid share on the facility connected account and marks each refunded', async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [
          { shareId: 'share-1', connectPaymentId: 'pay-1', connectPaymentStatus: 'PAID', stripePaymentIntentId: 'pi_1', stripeAccountId: 'acct_facility' },
          { shareId: 'share-2', connectPaymentId: 'pay-2', connectPaymentStatus: 'PAID', stripePaymentIntentId: 'pi_2', stripeAccountId: 'acct_facility' },
        ],
      })
      .mockResolvedValueOnce({ rowCount: 1 }) // connect_payments status update for pay-1 (inside executeConnectPaymentRefund)
      .mockResolvedValueOnce({ rowCount: 1 }) // ball_machine_passes sync no-op for pay-1
      .mockResolvedValueOnce({ rowCount: 1 }) // booking_payment_shares -> refunded for share-1
      .mockResolvedValueOnce({ rowCount: 1 }) // connect_payments status update for pay-2
      .mockResolvedValueOnce({ rowCount: 1 }) // ball_machine_passes sync no-op for pay-2
      .mockResolvedValueOnce({ rowCount: 1 }); // booking_payment_shares -> refunded for share-2

    const summary = await refundSplitPaymentShares('booking-1');

    expect(summary).toEqual({ refunded: 2, skipped: 0, failed: 0 });
    expect(refundsCreateMock).toHaveBeenCalledTimes(2);
    expect(refundsCreateMock).toHaveBeenNthCalledWith(1, { payment_intent: 'pi_1' }, { stripeAccount: 'acct_facility' });
    expect(refundsCreateMock).toHaveBeenNthCalledWith(2, { payment_intent: 'pi_2' }, { stripeAccount: 'acct_facility' });

    const shareUpdateCalls = queryMock.mock.calls.filter((call) => String(call[0]).includes("booking_payment_shares SET status = 'refunded'"));
    expect(shareUpdateCalls).toEqual([
      [expect.stringContaining("booking_payment_shares SET status = 'refunded'"), ['share-1']],
      [expect.stringContaining("booking_payment_shares SET status = 'refunded'"), ['share-2']],
    ]);
  });

  it('skips shares with no connect payment or a non-PAID connect payment, without calling Stripe', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        { shareId: 'share-3', connectPaymentId: null, connectPaymentStatus: null, stripePaymentIntentId: null, stripeAccountId: 'acct_facility' },
        { shareId: 'share-4', connectPaymentId: 'pay-4', connectPaymentStatus: 'REFUNDED', stripePaymentIntentId: 'pi_4', stripeAccountId: 'acct_facility' },
      ],
    });

    const summary = await refundSplitPaymentShares('booking-2');

    expect(summary).toEqual({ refunded: 0, skipped: 2, failed: 0 });
    expect(refundsCreateMock).not.toHaveBeenCalled();
  });

  it('counts a failed Stripe refund without throwing, and does not mark that share refunded', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        { shareId: 'share-5', connectPaymentId: 'pay-5', connectPaymentStatus: 'PAID', stripePaymentIntentId: 'pi_5', stripeAccountId: 'acct_facility' },
      ],
    });
    refundsCreateMock.mockRejectedValueOnce(new Error('Stripe unavailable'));

    const summary = await refundSplitPaymentShares('booking-3');

    expect(summary).toEqual({ refunded: 0, skipped: 0, failed: 1 });
    expect(queryMock.mock.calls.some((call) => String(call[0]).includes("booking_payment_shares SET status = 'refunded'"))).toBe(false);
  });
});
