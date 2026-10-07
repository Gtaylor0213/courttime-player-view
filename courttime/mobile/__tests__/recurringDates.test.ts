import { describe, expect, it } from '@jest/globals';
import { generateWeeklyDates } from '../src/utils/recurringDates';

describe('generateWeeklyDates', () => {
  it('expands weekdays between start and end inclusive', () => {
    // 2026-10-01 is a Thursday.
    expect(generateWeeklyDates('2026-10-01', ['Thursday', 'Saturday'], '2026-10-10')).toEqual([
      '2026-10-01', '2026-10-03', '2026-10-08', '2026-10-10',
    ]);
  });
  it('returns nothing for an empty selection or a reversed range', () => {
    expect(generateWeeklyDates('2026-10-01', [], '2026-10-10')).toEqual([]);
    expect(generateWeeklyDates('2026-10-10', ['Monday'], '2026-10-01')).toEqual([]);
  });
});
