import { describe, expect, it } from 'vitest';
import {
  formatOverviewSlotLabel,
  formatTimeLabel,
  getMonthDays,
  getMonthLeadingBlankCount,
  getOverviewDateStrings,
  getWeekDays,
  getWeekStart,
  groupBookingsByDate,
  shiftOverviewDate,
  toDateStr,
} from '../scheduleOverview';

describe('toDateStr', () => {
  it('uses the local calendar date, not UTC', () => {
    // Late evening local time still belongs to that local day.
    expect(toDateStr(new Date(2026, 4, 4, 23, 30))).toBe('2026-05-04');
  });
});

describe('getWeekStart', () => {
  it('anchors to Monday', () => {
    // 2026-05-06 is a Wednesday.
    expect(toDateStr(getWeekStart(new Date(2026, 4, 6)))).toBe('2026-05-04');
  });

  it('treats Sunday as the end of the week, not the start', () => {
    // 2026-05-10 is a Sunday; its week began Monday the 4th.
    expect(toDateStr(getWeekStart(new Date(2026, 4, 10)))).toBe('2026-05-04');
  });

  it('is stable when already on a Monday', () => {
    expect(toDateStr(getWeekStart(new Date(2026, 4, 4)))).toBe('2026-05-04');
  });
});

describe('getWeekDays', () => {
  it('returns seven days from Monday to Sunday', () => {
    expect(getWeekDays(new Date(2026, 4, 6)).map(toDateStr)).toEqual([
      '2026-05-04',
      '2026-05-05',
      '2026-05-06',
      '2026-05-07',
      '2026-05-08',
      '2026-05-09',
      '2026-05-10',
    ]);
  });

  it('crosses a month boundary', () => {
    const days = getWeekDays(new Date(2026, 3, 30)).map(toDateStr);
    expect(days[0]).toBe('2026-04-27');
    expect(days[6]).toBe('2026-05-03');
  });
});

describe('getMonthDays', () => {
  it('covers the whole month', () => {
    const days = getMonthDays(new Date(2026, 4, 15));
    expect(days).toHaveLength(31);
    expect(toDateStr(days[0])).toBe('2026-05-01');
    expect(toDateStr(days[30])).toBe('2026-05-31');
  });

  it('handles a leap February', () => {
    expect(getMonthDays(new Date(2028, 1, 10))).toHaveLength(29);
  });
});

describe('getMonthLeadingBlankCount', () => {
  it('counts blanks before a Friday the 1st', () => {
    // 2026-05-01 is a Friday: Mon-Thu are blank.
    expect(getMonthLeadingBlankCount(new Date(2026, 4, 15))).toBe(4);
  });

  it('is zero when the month starts on a Monday', () => {
    // 2026-06-01 is a Monday.
    expect(getMonthLeadingBlankCount(new Date(2026, 5, 10))).toBe(0);
  });

  it('is six when the month starts on a Sunday', () => {
    // 2026-11-01 is a Sunday.
    expect(getMonthLeadingBlankCount(new Date(2026, 10, 10))).toBe(6);
  });
});

describe('getOverviewDateStrings', () => {
  it('returns 7 dates for a week', () => {
    expect(getOverviewDateStrings('week', new Date(2026, 4, 6))).toHaveLength(7);
  });

  it('returns every day for a month', () => {
    expect(getOverviewDateStrings('month', new Date(2026, 4, 6))).toHaveLength(31);
  });
});

describe('shiftOverviewDate', () => {
  it('steps a week at a time', () => {
    expect(toDateStr(shiftOverviewDate('week', new Date(2026, 4, 6), 'next'))).toBe('2026-05-13');
    expect(toDateStr(shiftOverviewDate('week', new Date(2026, 4, 6), 'prev'))).toBe('2026-04-29');
  });

  it('steps a month at a time', () => {
    expect(toDateStr(shiftOverviewDate('month', new Date(2026, 4, 15), 'next'))).toBe('2026-06-01');
  });

  it('does not skip a short month when stepping from the 31st', () => {
    // Naively adding a month to Jan 31 lands in March.
    expect(toDateStr(shiftOverviewDate('month', new Date(2026, 0, 31), 'next'))).toBe('2026-02-01');
  });
});

describe('groupBookingsByDate', () => {
  it('groups by date and sorts each day by start time', () => {
    const grouped = groupBookingsByDate([
      { bookingDate: '2026-05-04', startTime: '14:00:00' },
      { bookingDate: '2026-05-04', startTime: '09:00:00' },
      { bookingDate: '2026-05-05', startTime: '10:00:00' },
    ]);
    expect(grouped['2026-05-04'].map((b) => b.startTime)).toEqual(['09:00:00', '14:00:00']);
    expect(grouped['2026-05-05']).toHaveLength(1);
  });

  it('skips entries with no date', () => {
    expect(groupBookingsByDate([{ bookingDate: '' }])).toEqual({});
  });
});

describe('formatTimeLabel', () => {
  it('formats 24-hour times with and without seconds', () => {
    expect(formatTimeLabel('09:00:00')).toBe('9:00 AM');
    expect(formatTimeLabel('13:30')).toBe('1:30 PM');
  });

  it('renders midnight and noon correctly', () => {
    expect(formatTimeLabel('00:00')).toBe('12:00 AM');
    expect(formatTimeLabel('12:00')).toBe('12:00 PM');
  });

  it('returns empty for missing input', () => {
    expect(formatTimeLabel(undefined)).toBe('');
    expect(formatTimeLabel('')).toBe('');
  });
});

describe('formatOverviewSlotLabel', () => {
  it('joins time and court', () => {
    expect(
      formatOverviewSlotLabel({ bookingDate: '2026-05-04', startTime: '09:00:00', courtName: 'Court 1' })
    ).toBe('9:00 AM · Court 1');
  });

  it('omits an absent court', () => {
    expect(formatOverviewSlotLabel({ bookingDate: '2026-05-04', startTime: '09:00:00' })).toBe(
      '9:00 AM'
    );
  });
});
