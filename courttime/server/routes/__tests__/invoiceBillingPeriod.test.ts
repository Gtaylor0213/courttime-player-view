import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/database/connection', () => ({ query: vi.fn() }));

import { invoiceBillingPeriod } from '../webhook';

const NOV_1_2026 = 1793547251; // 2026-11-01T15:34:11Z
const NOV_1_2027 = 1825083251; // 2027-11-01T15:34:11Z

/**
 * A subscription's first invoice reports period_start === period_end (the signup
 * moment); the real paid-for year is on the line item. Copying the invoice-level
 * fields made Medlock Bridge show "renews 11/1/2026" the day it subscribed.
 */
describe('invoiceBillingPeriod', () => {
  it('uses the line-item period on a subscription_create invoice', () => {
    const invoice = {
      billing_reason: 'subscription_create',
      period_start: NOV_1_2026,
      period_end: NOV_1_2026,
      lines: { data: [{ period: { start: NOV_1_2026, end: NOV_1_2027 } }] },
    } as any;
    const { start, end } = invoiceBillingPeriod(invoice);
    expect(start?.toISOString()).toBe('2026-11-01T15:34:11.000Z');
    expect(end?.toISOString()).toBe('2027-11-01T15:34:11.000Z');
  });

  it('never returns a zero-length period', () => {
    const invoice = { period_start: NOV_1_2026, period_end: NOV_1_2026, lines: { data: [] } } as any;
    expect(invoiceBillingPeriod(invoice)).toEqual({ start: null, end: null });
  });

  it('falls back to invoice-level period when lines carry none', () => {
    const invoice = { period_start: NOV_1_2026, period_end: NOV_1_2027, lines: { data: [] } } as any;
    expect(invoiceBillingPeriod(invoice).end?.toISOString()).toBe('2027-11-01T15:34:11.000Z');
  });
});
