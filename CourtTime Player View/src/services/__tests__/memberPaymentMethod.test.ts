import { beforeEach, describe, expect, it, vi } from 'vitest';
import type Stripe from 'stripe';

const queryMock = vi.fn();
const customersCreateMock = vi.fn();
const customersUpdateMock = vi.fn();
const setupIntentsRetrieveMock = vi.fn();
const paymentMethodsRetrieveMock = vi.fn();
const paymentMethodsDetachMock = vi.fn();

vi.mock('../../database/connection', () => ({
  query: (...args: unknown[]) => queryMock(...args),
}));

vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_member_payment_method_tests');

vi.mock('stripe', () => ({
  default: vi.fn().mockImplementation(() => ({
    customers: {
      create: customersCreateMock,
      update: customersUpdateMock,
    },
    setupIntents: { retrieve: setupIntentsRetrieveMock },
    paymentMethods: {
      retrieve: paymentMethodsRetrieveMock,
      detach: paymentMethodsDetachMock,
    },
  })),
}));

import {
  buildConnectCheckoutCustomerOptions,
  getMemberSavedPaymentMethod,
  getOrCreateConnectCustomer,
  markCheckoutSessionPaid,
  syncMemberPaymentMethodFromSetupSession,
} from '../stripeConnectService';

describe('member saved payment methods', () => {
  beforeEach(() => {
    queryMock.mockReset();
    customersCreateMock.mockReset();
    customersUpdateMock.mockReset();
    setupIntentsRetrieveMock.mockReset();
    paymentMethodsRetrieveMock.mockReset();
    paymentMethodsDetachMock.mockReset();
    customersCreateMock.mockResolvedValue({ id: 'cus_new' });
  });

  describe('buildConnectCheckoutCustomerOptions', () => {
    it('omits customer when none is stored', () => {
      expect(buildConnectCheckoutCustomerOptions(null)).toEqual({});
    });

    it('includes customer when a Connect customer id exists', () => {
      expect(buildConnectCheckoutCustomerOptions('cus_abc')).toEqual({ customer: 'cus_abc' });
    });
  });

  describe('getOrCreateConnectCustomer', () => {
    it('returns existing customer without calling Stripe', async () => {
      queryMock.mockResolvedValueOnce({
        rows: [{ stripe_customer_id: 'cus_existing' }],
      });

      const id = await getOrCreateConnectCustomer('user-1', 'club-1');

      expect(id).toBe('cus_existing');
      expect(customersCreateMock).not.toHaveBeenCalled();
    });

    it('creates a customer on the connected account when missing', async () => {
      queryMock
        .mockResolvedValueOnce({ rows: [{}] })
        .mockResolvedValueOnce({
          rows: [{ stripe_account_id: 'acct_club', stripe_onboarded: true }],
        })
        .mockResolvedValueOnce({
          rows: [{ email: 'player@example.com', full_name: 'Player One' }],
        })
        .mockResolvedValueOnce({ rows: [] });

      const id = await getOrCreateConnectCustomer('user-1', 'club-1');

      expect(id).toBe('cus_new');
      expect(customersCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'player@example.com',
          metadata: { userId: 'user-1', clubId: 'club-1' },
        }),
        { stripeAccount: 'acct_club' }
      );
    });
  });

  describe('getMemberSavedPaymentMethod', () => {
    it('returns null when no default payment method is stored', async () => {
      queryMock.mockResolvedValueOnce({ rows: [{}] });

      const method = await getMemberSavedPaymentMethod('user-1', 'club-1');

      expect(method).toBeNull();
    });

    it('returns card display fields when saved', async () => {
      queryMock.mockResolvedValueOnce({
        rows: [
          {
            stripe_default_payment_method_id: 'pm_1',
            card_brand: 'visa',
            card_last4: '4242',
            card_exp_month: 12,
            card_exp_year: 2030,
          },
        ],
      });

      const method = await getMemberSavedPaymentMethod('user-1', 'club-1');

      expect(method).toEqual({
        brand: 'visa',
        last4: '4242',
        expMonth: 12,
        expYear: 2030,
      });
    });
  });

  describe('syncMemberPaymentMethodFromSetupSession', () => {
    it('persists card metadata after setup checkout completes', async () => {
      const session = {
        mode: 'setup',
        metadata: { purpose: 'member_setup', userId: 'user-1', clubId: 'club-1' },
        setup_intent: 'seti_1',
        customer: 'cus_1',
      } as Stripe.Checkout.Session;

      queryMock.mockResolvedValueOnce({
        rows: [{ stripe_account_id: 'acct_club' }],
      });
      setupIntentsRetrieveMock.mockResolvedValueOnce({ payment_method: 'pm_1' });
      paymentMethodsRetrieveMock.mockResolvedValueOnce({
        card: { brand: 'visa', last4: '4242', exp_month: 8, exp_year: 2028 },
      });
      queryMock.mockResolvedValueOnce({ rows: [] });

      await syncMemberPaymentMethodFromSetupSession(session);

      expect(customersUpdateMock).toHaveBeenCalledWith(
        'cus_1',
        { invoice_settings: { default_payment_method: 'pm_1' } },
        { stripeAccount: 'acct_club' }
      );
      expect(queryMock).toHaveBeenLastCalledWith(
        expect.stringContaining('stripe_default_payment_method_id'),
        ['user-1', 'club-1', 'cus_1', 'pm_1', 'visa', '4242', 8, 2028]
      );
    });
  });

  describe('markCheckoutSessionPaid', () => {
    it('syncs saved card for setup sessions without updating connect_payments', async () => {
      const session = {
        mode: 'setup',
        metadata: { purpose: 'member_setup', userId: 'user-1', clubId: 'club-1' },
        setup_intent: 'seti_1',
        customer: 'cus_1',
      } as Stripe.Checkout.Session;

      queryMock.mockResolvedValueOnce({
        rows: [{ stripe_account_id: 'acct_club' }],
      });
      setupIntentsRetrieveMock.mockResolvedValueOnce({ payment_method: 'pm_1' });
      paymentMethodsRetrieveMock.mockResolvedValueOnce({
        card: { brand: 'visa', last4: '9999', exp_month: 1, exp_year: 2029 },
      });
      queryMock.mockResolvedValueOnce({ rows: [] });

      await markCheckoutSessionPaid(session);

      expect(queryMock).not.toHaveBeenCalledWith(
        expect.stringContaining('connect_payments'),
        expect.anything()
      );
    });
  });
});
