import { describe, expect, it } from '@jest/globals';
import { groupBookingsBySeries, minutesBetween } from '../src/utils/adminBookings';

describe('groupBookingsBySeries', () => {
  it('collapses recurring rows under their series, keeping first-seen order', () => {
    const rows = [
      { id: 'a', seriesId: null, isRecurring: false, bookingDate: '2026-10-01', startTime: '09:00:00' },
      { id: 'b', seriesId: 's1', isRecurring: true, bookingDate: '2026-10-08', startTime: '18:00:00' },
      { id: 'c', seriesId: null, isRecurring: false, bookingDate: '2026-10-02', startTime: '09:00:00' },
      { id: 'd', seriesId: 's1', isRecurring: true, bookingDate: '2026-10-01', startTime: '18:00:00' },
    ];
    const groups = groupBookingsBySeries(rows);
    expect(groups.map((g) => g.kind)).toEqual(['single', 'series', 'single']);
    const series = groups[1];
    expect(series.kind === 'series' && series.bookings.map((b) => b.id)).toEqual(['d', 'b']);
  });
  it('treats a recurring flag without a series id as a single row', () => {
    const groups = groupBookingsBySeries([{ id: 'x', isRecurring: true, seriesId: null, bookingDate: '2026-10-01', startTime: '09:00:00' }]);
    expect(groups[0].kind).toBe('single');
  });
});

describe('minutesBetween', () => {
  it('computes durations and rejects nonsense', () => {
    expect(minutesBetween('09:00:00', '10:30:00')).toBe(90);
    expect(minutesBetween('10:00', '09:00')).toBe(0);
    expect(minutesBetween('x', 'y')).toBe(0);
  });
});
