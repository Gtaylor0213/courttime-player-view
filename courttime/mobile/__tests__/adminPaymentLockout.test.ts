import { describe, it, expect } from '@jest/globals';
import {
  filterMembersBySearch,
  parseAdminLockoutMembers,
  parseLockoutAmountCents,
  paymentLockBadgeLabel,
} from '../src/utils/adminPaymentLockout';

describe('adminPaymentLockout utils', () => {
  it('parses member lockout fields from API rows', () => {
    const members = parseAdminLockoutMembers([
      {
        userId: 'u1',
        fullName: 'Alex Member',
        email: 'alex@example.com',
        isPaymentLocked: true,
        lockoutAmountCents: 2500,
      },
    ]);
    expect(members).toHaveLength(1);
    expect(members[0].isPaymentLocked).toBe(true);
    expect(members[0].lockoutAmountCents).toBe(2500);
  });

  it('filters by name or email', () => {
    const members = parseAdminLockoutMembers([
      { userId: '1', fullName: 'Alice', email: 'a@test.com', isPaymentLocked: false },
      { userId: '2', fullName: 'Bob', email: 'b@test.com', isPaymentLocked: false },
    ]);
    expect(filterMembersBySearch(members, 'bob')).toHaveLength(1);
    expect(filterMembersBySearch(members, '@test')).toHaveLength(2);
  });

  it('formats payment lock badge like web', () => {
    expect(
      paymentLockBadgeLabel({ isPaymentLocked: true, lockoutAmountCents: 2550 })
    ).toBe('Payment Locked · $25.50');
    expect(paymentLockBadgeLabel({ isPaymentLocked: true, lockoutAmountCents: null })).toBe(
      'Payment Locked'
    );
    expect(paymentLockBadgeLabel({ isPaymentLocked: false, lockoutAmountCents: null })).toBeNull();
  });

  it('validates lockout dollar amounts', () => {
    expect(parseLockoutAmountCents('25')).toEqual({ ok: true, cents: 2500 });
    expect(parseLockoutAmountCents('0')).toEqual({
      ok: false,
      message: 'Enter a valid amount greater than $0',
    });
  });
});
