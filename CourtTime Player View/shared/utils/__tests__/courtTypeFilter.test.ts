import { describe, expect, it } from 'vitest';
import { filterCourtsByType, getCourtTypes, isPeakSlot } from '../courtTypeFilter';
import { openStartWindows } from '../courtAvailability';

describe('court type filter', () => {
  const courts = [
    { id: '1', courtType: 'Pickleball' },
    { id: '2', courtType: 'Tennis' },
    { id: '3', courtType: 'Clubhouse' },
    { id: '4', type: 'tennis' },
  ];
  it('orders known sports first, then custom labels', () => {
    expect(getCourtTypes(courts)).toEqual(['Tennis', 'Pickleball', 'Clubhouse']);
  });
  it('filters case-insensitively and passes everything through for null', () => {
    expect(filterCourtsByType(courts, 'tennis').map((c) => c.id)).toEqual(['2', '4']);
    expect(filterCourtsByType(courts, null)).toHaveLength(4);
  });
});

describe('isPeakSlot', () => {
  const rows = [{ day_of_week: 2, prime_time_start: '17:00:00', prime_time_end: '20:00:00' }];
  it('is true inside the window on that weekday only', () => {
    expect(isPeakSlot(rows, 2, '17:00')).toBe(true);
    expect(isPeakSlot(rows, 2, '19:30')).toBe(true);
    expect(isPeakSlot(rows, 2, '20:00')).toBe(false);
    expect(isPeakSlot(rows, 3, '18:00')).toBe(false);
    expect(isPeakSlot(undefined, 2, '18:00')).toBe(false);
  });
});

describe('openStartWindows', () => {
  it('lists each open start with the end of its contiguous run', () => {
    const slots = [
      { startTime: '09:00:00', endTime: '09:30:00', available: true },
      { startTime: '09:30:00', endTime: '10:00:00', available: true },
      { startTime: '10:00:00', endTime: '10:30:00', available: false },
      { startTime: '10:30:00', endTime: '11:00:00', available: true },
    ];
    expect(openStartWindows(slots)).toEqual([
      { startTime: '09:00:00', endTime: '09:30:00', runEnd: '10:00:00' },
      { startTime: '09:30:00', endTime: '10:00:00', runEnd: '10:00:00' },
      { startTime: '10:30:00', endTime: '11:00:00', runEnd: '11:00:00' },
    ]);
  });
});
