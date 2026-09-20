import { describe, it, expect } from 'vitest';
import {
  expandWeeklyDates,
  expandRecurrence,
  normalizeWeekdays,
  parseYmd,
  toYmd,
  describeRecurrence,
  rulesEqual,
  type RecurrenceRule,
} from '../recurrence';

const rule: RecurrenceRule = {
  courtIds: ['court-a', 'court-b'],
  weekdays: [1, 3],
  startDate: '2026-09-21', // Monday
  endDate: '2026-10-05',
  startTime: '18:00:00',
  endTime: '19:30:00',
  durationMinutes: 90,
};

describe('normalizeWeekdays', () => {
  it('accepts names, numbers and numeric strings', () => {
    expect(normalizeWeekdays(['Monday', 3, '5'])).toEqual([1, 3, 5]);
  });

  it('dedupes and sorts', () => {
    expect(normalizeWeekdays([3, 'Wednesday', 1])).toEqual([1, 3]);
  });

  it('drops values outside 0-6 and unknown names', () => {
    expect(normalizeWeekdays([7, -1, 'Funday', 2])).toEqual([2]);
  });
});

describe('parseYmd / toYmd', () => {
  it('round-trips without a UTC shift', () => {
    expect(toYmd(parseYmd('2026-03-08')!)).toBe('2026-03-08');
  });

  it('rejects dates that Date would roll over', () => {
    expect(parseYmd('2026-02-30')).toBeNull();
    expect(parseYmd('nope')).toBeNull();
  });
});

describe('expandWeeklyDates', () => {
  it('returns every matching weekday in an inclusive range', () => {
    expect(expandWeeklyDates('2026-09-21', '2026-10-05', [1, 3])).toEqual([
      '2026-09-21',
      '2026-09-23',
      '2026-09-28',
      '2026-09-30',
      '2026-10-05',
    ]);
  });

  it('includes the end date when it matches', () => {
    expect(expandWeeklyDates('2026-09-21', '2026-09-21', [1])).toEqual(['2026-09-21']);
  });

  it('returns nothing when the range is inverted or no weekday is picked', () => {
    expect(expandWeeklyDates('2026-10-05', '2026-09-21', [1])).toEqual([]);
    expect(expandWeeklyDates('2026-09-21', '2026-10-05', [])).toEqual([]);
  });

  it('crosses a DST boundary without dropping or duplicating a date', () => {
    // US DST ends 2026-11-01; Sundays either side must both survive.
    expect(expandWeeklyDates('2026-10-25', '2026-11-08', [0])).toEqual([
      '2026-10-25',
      '2026-11-01',
      '2026-11-08',
    ]);
  });
});

describe('expandRecurrence', () => {
  it('produces one occurrence per court per date', () => {
    const out = expandRecurrence(rule);
    expect(out).toHaveLength(10);
    expect(out[0]).toEqual({
      courtId: 'court-a',
      bookingDate: '2026-09-21',
      startTime: '18:00:00',
      endTime: '19:30:00',
      durationMinutes: 90,
    });
    expect(out[1].courtId).toBe('court-b');
  });

  it('dedupes repeated courts', () => {
    expect(expandRecurrence({ ...rule, courtIds: ['court-a', 'court-a'] })).toHaveLength(5);
  });
});

describe('describeRecurrence', () => {
  it('summarizes days and range', () => {
    expect(describeRecurrence(rule)).toBe('Every Mon, Wed · Sep 21 to Oct 5');
  });

  it('collapses all seven days', () => {
    expect(describeRecurrence({ ...rule, weekdays: [0, 1, 2, 3, 4, 5, 6] })).toContain('Every day');
  });
});

describe('rulesEqual', () => {
  it('ignores court and weekday ordering', () => {
    expect(rulesEqual(rule, { ...rule, courtIds: ['court-b', 'court-a'], weekdays: [3, 1] })).toBe(true);
  });

  it('notices a changed time', () => {
    expect(rulesEqual(rule, { ...rule, startTime: '19:00:00' })).toBe(false);
  });
});
