import { describe, expect, it } from 'vitest';
import {
  courtAddPaymentCents,
  getAmountForCourts,
  isAtSubscriptionCap,
  MAX_COURTS_AT_LIST_PRICE,
  MAX_SUBSCRIPTION_CENTS,
  MIN_COURTS_COVERED,
  MIN_SUBSCRIPTION_CENTS,
  PER_COURT_CENTS,
} from '../subscriptionPricing';

describe('subscriptionPricing', () => {
  describe('getAmountForCourts', () => {
    it('applies $200 minimum for 1–4 courts', () => {
      expect(getAmountForCourts(1)).toBe(MIN_SUBSCRIPTION_CENTS);
      expect(getAmountForCourts(4)).toBe(MIN_SUBSCRIPTION_CENTS);
    });

    it('charges $50 per court between min and max', () => {
      expect(getAmountForCourts(5)).toBe(25000);
      expect(getAmountForCourts(10)).toBe(50000);
    });

    it('applies $550 maximum for 11+ courts', () => {
      expect(getAmountForCourts(11)).toBe(MAX_SUBSCRIPTION_CENTS);
      expect(getAmountForCourts(20)).toBe(MAX_SUBSCRIPTION_CENTS);
    });

    it('clamps invalid low court counts to minimum', () => {
      expect(getAmountForCourts(0)).toBe(MIN_SUBSCRIPTION_CENTS);
    });

    it('uses $50 per court constant', () => {
      expect(PER_COURT_CENTS).toBe(5000);
      expect(getAmountForCourts(6)).toBe(6 * PER_COURT_CENTS);
    });
  });

  describe('isAtSubscriptionCap', () => {
    it('returns true at 11 active courts', () => {
      expect(isAtSubscriptionCap(11, 50000)).toBe(true);
    });

    it('returns true at $550 annual amount', () => {
      expect(isAtSubscriptionCap(8, MAX_SUBSCRIPTION_CENTS)).toBe(true);
    });

    it('returns false below cap', () => {
      expect(isAtSubscriptionCap(8, 40000)).toBe(false);
    });
  });

  describe('courtAddPaymentCents', () => {
    it('charges $50 for a single court below cap', () => {
      expect(courtAddPaymentCents(1, 8, 40000)).toBe(PER_COURT_CENTS);
    });

    it('is free with 3 or fewer active courts (minimum covers 4)', () => {
      expect(MIN_COURTS_COVERED).toBe(4);
      expect(courtAddPaymentCents(1, 1, MIN_SUBSCRIPTION_CENTS)).toBe(0);
      expect(courtAddPaymentCents(1, 2, MIN_SUBSCRIPTION_CENTS)).toBe(0);
      expect(courtAddPaymentCents(1, 3, MIN_SUBSCRIPTION_CENTS)).toBe(0);
    });

    it('charges once the 4 covered courts are used up', () => {
      expect(courtAddPaymentCents(1, 4, MIN_SUBSCRIPTION_CENTS)).toBe(PER_COURT_CENTS);
      // 3 active + 2 added: 4th is covered, 5th is charged
      expect(courtAddPaymentCents(2, 3, MIN_SUBSCRIPTION_CENTS)).toBe(PER_COURT_CENTS);
      // 1 active + 5 added: courts 2-4 covered, 5th and 6th charged
      expect(courtAddPaymentCents(5, 1, MIN_SUBSCRIPTION_CENTS)).toBe(2 * PER_COURT_CENTS);
    });

    it('charges nothing at or above cap', () => {
      expect(courtAddPaymentCents(1, MAX_COURTS_AT_LIST_PRICE, 50000)).toBe(0);
      expect(courtAddPaymentCents(3, 12, MAX_SUBSCRIPTION_CENTS)).toBe(0);
    });

    it('charges only for courts before cap on bulk add', () => {
      expect(courtAddPaymentCents(5, 10, 50000)).toBe(PER_COURT_CENTS);
      expect(courtAddPaymentCents(2, 10, 50000)).toBe(PER_COURT_CENTS);
      expect(courtAddPaymentCents(2, 9, 45000)).toBe(2 * PER_COURT_CENTS);
    });
  });
});
