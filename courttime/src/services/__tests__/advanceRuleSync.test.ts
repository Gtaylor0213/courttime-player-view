import { describe, expect, it } from 'vitest';
import { applyAccountCapsToBookingRules, applyMaxDurationToBookingRules } from '../advanceRuleSync';

/**
 * The mobile admin writes rules straight to the engine. These copy that engine row into the
 * booking_rules keys the web admin form and Club Info read.
 */
describe('applyAccountCapsToBookingRules (ACC-002)', () => {
  it('writes weekly and daily caps into nested and flat keys', () => {
    const rules = applyAccountCapsToBookingRules(
      { courtsPerWeekUser: '2', userLimits: { perWeekHousehold: { enabled: true, limit: 5 } } },
      { isEnabled: true, config: { max_per_week: 4, max_per_day_enabled: true, max_per_day: 1 } }
    );
    expect(rules.userLimits.perWeekIndividual).toEqual({ enabled: true, limit: 4 });
    expect(rules.userLimits.perDayIndividual).toEqual({ enabled: true, limit: 1 });
    expect(rules.userLimits.perWeekHousehold).toEqual({ enabled: true, limit: 5 });
    expect(rules.courtsPerWeekUser).toBe('4');
    expect(rules.courtsPerWeekUserEnabled).toBe(true);
    expect(rules.maxBookingsPerWeek).toBe('4');
    expect(rules.maxBookingsPerWeekUnlimited).toBe(false);
    expect(rules.courtsPerDayUser).toBe('1');
    expect(rules.courtsPerDayUserEnabled).toBe(true);
    expect(rules.maxBookingsPerDayUnlimited).toBe(false);
  });

  it('turns both caps off but keeps their limits when the rule is removed', () => {
    const rules = applyAccountCapsToBookingRules(
      {
        userLimits: { perWeekIndividual: { enabled: true, limit: 3 }, perDayIndividual: { enabled: true, limit: 2 } },
      },
      null
    );
    expect(rules.userLimits.perWeekIndividual).toEqual({ enabled: false, limit: 3 });
    expect(rules.userLimits.perDayIndividual).toEqual({ enabled: false, limit: 2 });
    expect(rules.courtsPerWeekUserEnabled).toBe(false);
    expect(rules.maxBookingsPerWeekUnlimited).toBe(true);
    expect(rules.courtsPerDayUserEnabled).toBe(false);
  });

  it('leaves the daily cap off when the engine row has no daily setting', () => {
    const rules = applyAccountCapsToBookingRules({}, { isEnabled: true, config: { max_per_week: '3' } });
    expect(rules.userLimits.perWeekIndividual).toEqual({ enabled: true, limit: 3 });
    expect(rules.userLimits.perDayIndividual.enabled).toBe(false);
  });
});

describe('applyMaxDurationToBookingRules (CRT-005)', () => {
  it('writes the limit into nested and legacy keys', () => {
    const rules = applyMaxDurationToBookingRules({}, { isEnabled: true, config: { max_duration_minutes: 90 } });
    expect(rules.maxReservationDuration).toEqual({ enabled: true, limit: 90 });
    expect(rules.maxReservationDurationEnabled).toBe(true);
    expect(rules.maxBookingDurationUnlimited).toBe(false);
    expect(rules.maxReservationDurationMinutes).toBe('90');
    expect(rules.maxBookingDurationHours).toBe('1.5');
  });

  it('turns the rule off but keeps the last limit when removed', () => {
    const rules = applyMaxDurationToBookingRules({ maxReservationDuration: { enabled: true, limit: 60 } }, null);
    expect(rules.maxReservationDuration).toEqual({ enabled: false, limit: 60 });
    expect(rules.maxBookingDurationUnlimited).toBe(true);
  });

  it('carries per-court-type caps when the row has them and leaves them alone otherwise', () => {
    const withByType = applyMaxDurationToBookingRules(
      {},
      {
        isEnabled: true,
        config: {
          max_duration_minutes: 120,
          max_duration_by_court_type: { enabled: true, tennisMinutes: 120, pickleballMinutes: 90 },
        },
      }
    );
    expect(withByType.maxReservationDurationByCourtType).toEqual({ enabled: true, tennisMinutes: 120, pickleballMinutes: 90 });
    expect(withByType.maxReservationDurationPickleballMinutes).toBe('90');

    const existing = { enabled: true, tennisMinutes: 60, pickleballMinutes: 60 };
    const without = applyMaxDurationToBookingRules(
      { maxReservationDurationByCourtType: existing },
      { isEnabled: true, config: { max_duration_minutes: 120 } }
    );
    expect(without.maxReservationDurationByCourtType).toEqual(existing);
  });
});
