import { describe, it, expect } from 'vitest';
import { describeRecurringConflict } from '../recurringConflicts';

describe('describeRecurringConflict', () => {
  it('formats the court, weekday, date, and 12-hour time', () => {
    expect(
      describeRecurringConflict({
        courtId: 'c1',
        courtName: 'Court 3',
        bookingDate: '2026-07-21',
        startTime: '18:00:00',
        endTime: '19:00:00',
      })
    ).toBe('Court 3 on Tuesday, July 21, 2026 at 6:00 PM');
  });

  it('handles morning and noon times', () => {
    expect(
      describeRecurringConflict({
        courtId: 'c1',
        courtName: 'Court 1',
        bookingDate: '2026-08-03',
        startTime: '09:30:00',
        endTime: '10:30:00',
      })
    ).toBe('Court 1 on Monday, August 3, 2026 at 9:30 AM');
    expect(
      describeRecurringConflict({
        courtId: 'c1',
        courtName: 'Court 1',
        bookingDate: '2026-08-03',
        startTime: '12:00:00',
        endTime: '13:00:00',
      })
    ).toBe('Court 1 on Monday, August 3, 2026 at 12:00 PM');
  });
});
