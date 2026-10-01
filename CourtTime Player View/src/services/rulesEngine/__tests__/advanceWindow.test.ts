import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../database/connection', () => ({
  query: vi.fn(),
  transaction: vi.fn(),
  getPool: vi.fn(),
}));

import {
  advanceWindowViolation,
  resolveMaxDaysAhead,
  resolveMaxDaysAheadForMember,
} from '../advanceWindow';
import { accountEvaluators } from '../evaluators/AccountRuleEvaluators';
import type { FacilityRuleConfig, RuleContext, SimplifiedBookingRules } from '../types';

const acc005 = (overrides: Partial<FacilityRuleConfig> = {}): FacilityRuleConfig => ({
  id: 'r1',
  facilityId: 'f1',
  ruleDefinitionId: 'd1',
  ruleCode: 'ACC-005',
  ruleCategory: 'account',
  ruleName: 'Advance Booking Window',
  ruleConfig: { max_days_ahead: 7 },
  isEnabled: true,
  priority: 0,
  ...overrides,
});

const simplified = (enabled: boolean, limit: number) =>
  ({ daysInAdvance: { enabled, limit } }) as unknown as SimplifiedBookingRules;

describe('resolveMaxDaysAhead', () => {
  it('uses the ACC-005 config', () => {
    expect(resolveMaxDaysAhead({ acc005Rule: acc005() })).toBe(7);
  });

  it('falls back to booking_rules JSON when there is no ACC-005 row', () => {
    expect(resolveMaxDaysAhead({ simplified: simplified(true, 10) })).toBe(10);
    expect(resolveMaxDaysAhead({ simplified: simplified(false, 10) })).toBeNull();
  });

  it('lets a tier tighten but never loosen the facility cap', () => {
    expect(resolveMaxDaysAhead({ acc005Rule: acc005(), tierAdvanceBookingDays: 3 })).toBe(3);
    expect(resolveMaxDaysAhead({ acc005Rule: acc005(), tierAdvanceBookingDays: 30 })).toBe(7);
  });
});

describe('resolveMaxDaysAheadForMember', () => {
  it('treats an ACC-005 row scoped to other tiers as no limit (not the JSON fallback)', () => {
    expect(
      resolveMaxDaysAheadForMember({
        facilityRules: [acc005({ appliesToTierIds: ['gold'] })],
        simplified: simplified(true, 5),
        tier: { id: 'basic' },
      })
    ).toBeNull();
  });

  it('uses the JSON fallback only when the facility has no ACC-005 row', () => {
    expect(
      resolveMaxDaysAheadForMember({ facilityRules: [], simplified: simplified(true, 5) })
    ).toBe(5);
  });
});

describe('advanceWindowViolation', () => {
  const base = { ruleCode: 'ACC-005', ruleName: 'Advance Booking Window', facilityTodayYmd: '2026-10-01' };

  it('allows the last day of the window and blocks the day after', () => {
    expect(advanceWindowViolation({ ...base, maxDaysAhead: 7, bookingYmd: '2026-10-07' })).toBeNull();
    const blocked = advanceWindowViolation({ ...base, maxDaysAhead: 7, bookingYmd: '2026-10-08' });
    expect(blocked?.passed).toBe(false);
    expect(blocked?.message).toContain('latest date you can book right now is Wed, Oct 7');
    expect(blocked?.details).not.toHaveProperty('earliestAllowedDate');
  });

  it('never blocks when there is no limit', () => {
    expect(advanceWindowViolation({ ...base, maxDaysAhead: null, bookingYmd: '2027-01-01' })).toBeNull();
  });
});

describe('ACC-005 evaluator', () => {
  const evaluator = accountEvaluators.find((e) => e.ruleCode === 'ACC-005')!;

  beforeEach(() => {
    vi.useFakeTimers();
    // 2026-10-01 10:00 in New York
    vi.setSystemTime(new Date('2026-10-01T14:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const ctx = (bookingDate: string) =>
    ({
      facility: { timezone: 'America/New_York' },
      user: {},
      request: { bookingDate },
    }) as unknown as RuleContext;

  it('passes on the last bookable day and fails the next day', async () => {
    expect((await evaluator.evaluate(ctx('2026-10-07'), { max_days_ahead: 7 })).passed).toBe(true);
    const result = await evaluator.evaluate(ctx('2026-10-08'), { max_days_ahead: 7 });
    expect(result.passed).toBe(false);
    expect(result.details?.lastBookableLabel).toBe('Wed, Oct 7');
  });
});
