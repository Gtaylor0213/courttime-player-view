import { describe, it, expect } from '@jest/globals';
import {
  aggregateThisMonthBreakdown,
  formatCentsAsDollars,
  parseAdminRevenueResponse,
  revenuePaymentTypeLabel,
} from '../src/utils/adminRevenue';

describe('adminRevenue utils', () => {
  it('formats cents as dollars', () => {
    expect(formatCentsAsDollars(1250)).toBe('12.50');
  });

  it('maps payment types to user-facing labels', () => {
    expect(revenuePaymentTypeLabel('COURT_BOOKING')).toBe('Court booking');
    expect(revenuePaymentTypeLabel('GUEST_FEE')).toBe('Guest fee');
  });

  it('aggregates monthly rows for the current month', () => {
    const breakdown = aggregateThisMonthBreakdown(
      [
        { month: '2026-05', payment_type: 'COURT_BOOKING', total_cents: 1000 },
        { month: '2026-05', payment_type: 'GUEST_FEE', total_cents: 500 },
        { month: '2026-04', payment_type: 'COURT_BOOKING', total_cents: 9999 },
      ],
      '2026-05'
    );
    expect(breakdown.COURT_BOOKING).toBe(1000);
    expect(breakdown.GUEST_FEE).toBe(500);
    expect(breakdown.COURT_BOOKING).not.toBe(9999);
  });

  it('parses nested API envelope', () => {
    const parsed = parseAdminRevenueResponse({
      success: true,
      data: {
        totals: { thisMonthCents: 3000, allTimeCents: 5000, lastMonthCents: 0, thisYearCents: 4000 },
        monthly: [{ month: '2026-05', payment_type: 'PAYMENT_ITEM', total_cents: 3000 }],
        transactions: [{ id: '1', amount_cents: 3000, payment_type: 'PAYMENT_ITEM', paid_at: '2026-05-01' }],
      },
    });
    expect(parsed?.totals.thisMonthCents).toBe(3000);
    expect(parsed?.breakdownCents.PAYMENT_ITEM).toBe(3000);
    expect(parsed?.transactions).toHaveLength(1);
  });
});
