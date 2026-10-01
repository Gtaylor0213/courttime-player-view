import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../database/connection', () => ({
  query: vi.fn(),
  transaction: vi.fn(),
  getPool: vi.fn(),
}));

import {
  advanceWindowViolation,
  getFacilityNowYmdHour,
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

describe('getFacilityNowYmdHour', () => {
  it('reads the facility wall clock, not the server clock', () => {
    // 2026-10-01 21:20 UTC = 5:20 PM in New York
    expect(getFacilityNowYmdHour('America/New_York', new Date('2026-10-01T21:20:00Z'))).toEqual({
      ymd: '2026-10-01',
      hour: 17,
    });
    // 03:30 UTC Oct 2 = 11:30 PM Oct 1 in New York
    expect(getFacilityNowYmdHour('America/New_York', new Date('2026-10-02T03:30:00Z'))).toEqual({
      ymd: '2026-10-01',
      hour: 23,
    });
  });
});

describe('advanceWindowViolation', () => {
  // 5:20 PM in New York on Oct 1 → cutoff Oct 8 at 5:00 PM (on the hour)
  const now = new Date('2026-10-01T21:20:00Z');
  const base = {
    ruleCode: 'ACC-005',
    ruleName: 'Advance Booking Window',
    timeZone: 'America/New_York',
    now,
  };

  it('allows reservations ending by the cutoff and blocks ones ending after it', () => {
    expect(
      advanceWindowViolation({ ...base, maxDaysAhead: 7, bookingYmd: '2026-10-08', startTime: '16:00:00', endTime: '17:00:00' })
    ).toBeNull();
    const blocked = advanceWindowViolation({
      ...base,
      maxDaysAhead: 7,
      bookingYmd: '2026-10-08',
      startTime: '16:30:00',
      endTime: '17:30:00',
    });
    expect(blocked?.passed).toBe(false);
    expect(blocked?.message).toContain('must end by Thu, Oct 8 at 5:00 PM');
    expect(blocked?.details?.cutoffLabel).toBe('Thu, Oct 8 at 5:00 PM');
  });

  it('never blocks when there is no limit', () => {
    expect(
      advanceWindowViolation({ ...base, maxDaysAhead: null, bookingYmd: '2027-01-01', startTime: '08:00', endTime: '09:00' })
    ).toBeNull();
  });
});

describe('ACC-005 evaluator', () => {
  const evaluator = accountEvaluators.find((e) => e.ruleCode === 'ACC-005')!;

  beforeEach(() => {
    vi.useFakeTimers();
    // 2026-10-01 5:20 PM in New York
    vi.setSystemTime(new Date('2026-10-01T21:20:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const ctx = (bookingDate: string, startTime: string, endTime: string) =>
    ({
      facility: { timezone: 'America/New_York' },
      user: {},
      request: { bookingDate, startTime, endTime },
    }) as unknown as RuleContext;

  it('opens the eighth day up to the current hour', async () => {
    expect((await evaluator.evaluate(ctx('2026-10-08', '15:00:00', '17:00:00'), { max_days_ahead: 7 })).passed).toBe(true);
    const result = await evaluator.evaluate(ctx('2026-10-08', '17:00:00', '18:00:00'), { max_days_ahead: 7 });
    expect(result.passed).toBe(false);
    expect(result.details?.cutoffLabel).toBe('Thu, Oct 8 at 5:00 PM');
  });
});
