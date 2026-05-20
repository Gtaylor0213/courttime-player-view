import { beforeEach, describe, expect, it, vi } from 'vitest';

const queryMock = vi.fn();
const refundsCreateMock = vi.fn();

vi.mock('../../database/connection', () => ({
  query: (...args: unknown[]) => queryMock(...args),
}));

vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_bulletin_signup_refund');

vi.mock('stripe', () => ({
  default: vi.fn().mockImplementation(() => ({
    refunds: { create: refundsCreateMock },
  })),
}));

import { refundBulletinSignupPaymentsForPost } from '../stripeConnectService';

describe('refundBulletinSignupPaymentsForPost', () => {
  beforeEach(() => {
    queryMock.mockReset();
    refundsCreateMock.mockReset();
    refundsCreateMock.mockResolvedValue({ id: 're_123' });
  });

  it('returns zeros when Stripe is not configured', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_xxxx');

    const summary = await refundBulletinSignupPaymentsForPost('post-1');

    expect(summary).toEqual({ refunded: 0, skipped: 0, failed: 0 });
    expect(queryMock).not.toHaveBeenCalled();

    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_bulletin_signup_refund');
  });

  it('refunds paid confirmed signups on the connected account', async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'pay-1',
            status: 'PAID',
            stripePaymentIntentId: 'pi_abc',
            stripeAccountId: 'acct_facility',
          },
        ],
      })
      .mockResolvedValueOnce({ rowCount: 1 });

    const summary = await refundBulletinSignupPaymentsForPost('post-1');

    expect(summary).toEqual({ refunded: 1, skipped: 0, failed: 0 });
    expect(refundsCreateMock).toHaveBeenCalledWith(
      { payment_intent: 'pi_abc' },
      { stripeAccount: 'acct_facility' }
    );
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("SET status = 'REFUNDED'"),
      ['pay-1']
    );

    const lookupSql = String(queryMock.mock.calls[0][0]);
    expect(lookupSql).toContain("bds.status = 'confirmed'");
    expect(lookupSql).toContain('connect_payment_id IS NOT NULL');
  });

  it('skips payments that are already refunded', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: 'pay-2',
          status: 'REFUNDED',
          stripePaymentIntentId: 'pi_old',
          stripeAccountId: 'acct_facility',
        },
      ],
    });

    const summary = await refundBulletinSignupPaymentsForPost('post-2');

    expect(summary).toEqual({ refunded: 0, skipped: 1, failed: 0 });
    expect(refundsCreateMock).not.toHaveBeenCalled();
  });

  it('counts failures without throwing', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: 'pay-3',
          status: 'PAID',
          stripePaymentIntentId: 'pi_fail',
          stripeAccountId: 'acct_facility',
        },
      ],
    });
    refundsCreateMock.mockRejectedValueOnce(new Error('Stripe unavailable'));

    const summary = await refundBulletinSignupPaymentsForPost('post-3');

    expect(summary).toEqual({ refunded: 0, skipped: 0, failed: 1 });
  });
});
