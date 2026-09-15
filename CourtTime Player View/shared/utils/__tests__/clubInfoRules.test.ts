import { describe, expect, it } from 'vitest';
import {
  getClubInfoRuleRows,
  getMaxBookingDurationDisplay,
  getMaxBookingDurationHoursLabel,
  getPeakHoursSlotDisplays,
  parseBookingRules,
} from '../clubInfoRules';

describe('getMaxBookingDurationHoursLabel', () => {
  it('reads the current { enabled, limit } shape in minutes', () => {
    expect(getMaxBookingDurationHoursLabel({ maxReservationDuration: { enabled: true, limit: 120 } })).toBe('2');
  });

  it('renders a fractional limit to two decimals', () => {
    expect(getMaxBookingDurationHoursLabel({ maxReservationDuration: { enabled: true, limit: 90 } })).toBe('1.5');
  });

  it('returns nothing when the limit is disabled', () => {
    expect(getMaxBookingDurationHoursLabel({ maxReservationDuration: { enabled: false, limit: 120 } })).toBeNull();
  });

  it('reads the flat minutes shape', () => {
    expect(
      getMaxBookingDurationHoursLabel({
        maxReservationDurationEnabled: true,
        maxReservationDurationMinutes: 90,
      })
    ).toBe('1.5');
  });

  it('treats a small flat value as hours, not minutes', () => {
    // The older shape stored hours here; 2 means two hours, not two minutes.
    expect(
      getMaxBookingDurationHoursLabel({
        maxReservationDurationEnabled: true,
        maxReservationDurationMinutes: 2,
      })
    ).toBe('2');
  });

  it('reads the legacy unlimited/hours pair', () => {
    expect(
      getMaxBookingDurationHoursLabel({ maxBookingDurationUnlimited: false, maxBookingDurationHours: 3 })
    ).toBe('3');
    expect(getMaxBookingDurationHoursLabel({ maxBookingDurationUnlimited: true })).toBeNull();
  });

  it('returns nothing for absent or malformed rules', () => {
    expect(getMaxBookingDurationHoursLabel(null)).toBeNull();
    expect(getMaxBookingDurationHoursLabel(undefined)).toBeNull();
    expect(getMaxBookingDurationHoursLabel({})).toBeNull();
  });
});

describe('getMaxBookingDurationDisplay', () => {
  const base = { maxReservationDuration: { enabled: true, limit: 120 } };

  it('returns a single label when the court-type split is off', () => {
    expect(getMaxBookingDurationDisplay(base)).toBe('2');
  });

  it('splits tennis and pickleball when they differ', () => {
    expect(
      getMaxBookingDurationDisplay({
        ...base,
        maxReservationDurationByCourtType: {
          enabled: true,
          tennisMinutes: 120,
          pickleballMinutes: 60,
        },
      })
    ).toEqual({ tennis: '2', pickleball: '1' });
  });

  it('collapses back to one label when both court types agree', () => {
    expect(
      getMaxBookingDurationDisplay({
        ...base,
        maxReservationDurationByCourtType: {
          enabled: true,
          tennisMinutes: 90,
          pickleballMinutes: 90,
        },
      })
    ).toBe('1.5');
  });

  it('falls back to the facility default for a court type with no override', () => {
    // Mirrors the rules engine: an unset override inherits the default.
    expect(
      getMaxBookingDurationDisplay({
        ...base,
        maxReservationDurationByCourtType: { enabled: true, pickleballMinutes: 60 },
      })
    ).toEqual({ tennis: '2', pickleball: '1' });
  });

  it('ignores the split when it is not enabled', () => {
    expect(
      getMaxBookingDurationDisplay({
        ...base,
        maxReservationDurationByCourtType: {
          enabled: false,
          tennisMinutes: 120,
          pickleballMinutes: 60,
        },
      })
    ).toBe('2');
  });

  it('supports the flat byCourtTypeEnabled key', () => {
    expect(
      getMaxBookingDurationDisplay({
        ...base,
        maxReservationDurationByCourtTypeEnabled: true,
        maxReservationDurationTennisMinutes: 180,
        maxReservationDurationPickleballMinutes: 60,
      })
    ).toEqual({ tennis: '3', pickleball: '1' });
  });
});

describe('parseBookingRules', () => {
  it('passes an object through', () => {
    expect(parseBookingRules({ advanceBookingDays: 14 })).toEqual({ advanceBookingDays: 14 });
  });

  it('parses a JSON string', () => {
    expect(parseBookingRules('{"advanceBookingDays":14}')).toEqual({ advanceBookingDays: 14 });
  });

  it('parses doubly-encoded peak hour slots', () => {
    const parsed = parseBookingRules({
      hasPeakHours: true,
      peakHoursSlots: '[{"startTime":"17:00","endTime":"20:00"}]',
    });
    expect(parsed?.peakHoursSlots).toEqual([{ startTime: '17:00', endTime: '20:00' }]);
  });

  it('returns null rather than throwing on malformed JSON', () => {
    expect(parseBookingRules('{not json')).toBeNull();
    expect(parseBookingRules('')).toBeNull();
    expect(parseBookingRules(null)).toBeNull();
  });

  it('keeps the rules when only the inner slots are malformed', () => {
    const parsed = parseBookingRules({ hasPeakHours: true, peakHoursSlots: '{not json' });
    expect(parsed?.hasPeakHours).toBe(true);
    expect(getPeakHoursSlotDisplays(parsed?.peakHoursSlots)).toEqual([]);
  });
});

describe('getClubInfoRuleRows', () => {
  it('lists configured rules in display order', () => {
    expect(
      getClubInfoRuleRows({
        advanceBookingDaysUnlimited: false,
        advanceBookingDays: 14,
        maxReservationDuration: { enabled: true, limit: 120 },
        maxBookingsPerWeekUnlimited: false,
        maxBookingsPerWeek: 3,
        noOverlappingReservations: true,
      })
    ).toEqual([
      { label: 'Book up to', value: '14 days in advance' },
      { label: 'Max booking duration', value: '2 hours' },
      { label: 'Max bookings per week', value: '3' },
      { label: 'Overlapping bookings', value: 'Not allowed' },
    ]);
  });

  it('omits rules the facility left unlimited', () => {
    expect(
      getClubInfoRuleRows({
        advanceBookingDaysUnlimited: true,
        advanceBookingDays: 14,
        maxBookingsPerWeekUnlimited: true,
        maxBookingsPerWeek: 3,
      })
    ).toEqual([]);
  });

  it('emits one row per court type when durations differ', () => {
    expect(
      getClubInfoRuleRows({
        maxReservationDuration: { enabled: true, limit: 120 },
        maxReservationDurationByCourtType: {
          enabled: true,
          tennisMinutes: 120,
          pickleballMinutes: 60,
        },
      })
    ).toEqual([
      { label: 'Max duration (Tennis)', value: '2 hours' },
      { label: 'Max duration (Pickleball)', value: '1 hours' },
    ]);
  });

  it('returns nothing for absent rules', () => {
    expect(getClubInfoRuleRows(null)).toEqual([]);
  });
});

describe('getPeakHoursSlotDisplays', () => {
  it('formats times and days into a heading', () => {
    expect(
      getPeakHoursSlotDisplays([{ startTime: '17:00', endTime: '20:00', days: [1, 3, 5] }])
    ).toEqual([{ heading: '5:00 PM – 8:00 PM · Mon, Wed, Fri', details: [] }]);
  });

  it('includes the per-slot limits when set', () => {
    expect(
      getPeakHoursSlotDisplays([
        {
          startTime: '17:00',
          endTime: '20:00',
          days: [],
          rules: { maxBookingsPerDay: 1, maxDurationHours: 1.5 },
        },
      ])[0].details
    ).toEqual(['Max 1 booking(s) per day during peak hours', 'Max duration: 1.5 hours']);
  });

  it('omits limits marked unlimited', () => {
    expect(
      getPeakHoursSlotDisplays([
        {
          startTime: '17:00',
          endTime: '20:00',
          rules: {
            maxBookingsPerDay: 1,
            maxBookingsPerDayUnlimited: true,
            maxDurationHours: 2,
            maxDurationUnlimited: true,
          },
        },
      ])[0].details
    ).toEqual([]);
  });

  it('returns nothing when slots are absent', () => {
    expect(getPeakHoursSlotDisplays(undefined)).toEqual([]);
    expect(getPeakHoursSlotDisplays(null)).toEqual([]);
  });
});
