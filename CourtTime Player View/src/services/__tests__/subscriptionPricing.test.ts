import { describe, expect, it } from 'vitest';
import {
  getAmountForCourts,
  MAX_SUBSCRIPTION_CENTS,
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
});
