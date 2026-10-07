import { beforeEach, describe, expect, it, vi } from 'vitest';

const queryMock = vi.fn();
const refundsCreateMock = vi.fn();

vi.mock('../../database/connection', () => ({
  query: (...args: unknown[]) => queryMock(...args),
}));

vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_refund_connect_payment');

vi.mock('stripe', () => ({
  default: vi.fn().mockImplementation(() => ({
    refunds: { create: refundsCreateMock },
  })),
}));

import { refundConnectPayment } from '../stripeConnectService';

describe('refundConnectPayment', () => {
  beforeEach(() => {
    queryMock.mockReset();
    refundsCreateMock.mockReset();
    refundsCreateMock.mockResolvedValue({ id: 're_admin_123' });
  });

  it('rejects when payment is not found', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    await expect(refundConnectPayment('missing', 'admin-1')).rejects.toThrow('Payment not found');
  });

  it('rejects when user is not a club admin', async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'pay-1',
            club_id: 'club-1',
            status: 'PAID',
            stripePaymentIntentId: 'pi_abc',
            stripeAccountId: 'acct_facility',
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });

    await expect(refundConnectPayment('pay-1', 'admin-1')).rejects.toThrow(
      'Not authorized to refund this payment'
    );
    expect(refundsCreateMock).not.toHaveBeenCalled();
  });

  it('rejects already-refunded payments', async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'pay-2',
            club_id: 'club-1',
            status: 'REFUNDED',
            stripePaymentIntentId: 'pi_old',
            stripeAccountId: 'acct_facility',
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });

    await expect(refundConnectPayment('pay-2', 'admin-1')).rejects.toThrow(
      'Payment has already been refunded'
    );
    expect(refundsCreateMock).not.toHaveBeenCalled();
  });

  it('refunds a paid charge on the connected account', async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'pay-3',
            club_id: 'club-1',
            status: 'PAID',
            stripePaymentIntentId: 'pi_abc',
            stripeAccountId: 'acct_facility',
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })
      .mockResolvedValueOnce({ rowCount: 1 });

    const result = await refundConnectPayment('pay-3', 'admin-1');

    expect(result).toEqual({
      connectPaymentId: 'pay-3',
      status: 'REFUNDED',
      stripeRefundId: 're_admin_123',
    });
    expect(refundsCreateMock).toHaveBeenCalledWith(
      { payment_intent: 'pi_abc' },
      { stripeAccount: 'acct_facility' }
    );
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("SET status = 'REFUNDED'"),
      ['pay-3']
    );
  });
});
