import { describe, expect, it } from 'vitest';
import { blackoutsToBlockedRanges, parseBlackoutDatetime } from '../blackoutSlots';

describe('parseBlackoutDatetime', () => {
  it('treats a bare datetime as local wall time', () => {
    const d = parseBlackoutDatetime('2026-09-17T14:30:00');
    expect(d?.getHours()).toBe(14);
    expect(d?.getMinutes()).toBe(30);
  });
  it('rejects garbage', () => {
    expect(parseBlackoutDatetime('nope')).toBeNull();
    expect(parseBlackoutDatetime(undefined)).toBeNull();
  });
});

describe('blackoutsToBlockedRanges', () => {
  const courts = ['c1', 'c2'];

  it('applies a facility-wide blackout to every court, snapped to 15 minutes', () => {
    const ranges = blackoutsToBlockedRanges(
      [{ id: 'b1', court_id: null, title: 'Resurfacing', start_datetime: '2026-09-17T09:05:00', end_datetime: '2026-09-17T10:50:00' }],
      '2026-09-17',
      courts
    );
    expect(ranges).toHaveLength(2);
    expect(ranges[0]).toMatchObject({ courtId: 'c1', startTime: '09:00:00', endTime: '11:00:00', label: 'Resurfacing' });
  });

  it('limits a court blackout to that court and clamps multi-day ranges to the day', () => {
    const ranges = blackoutsToBlockedRanges(
      [{ id: 'b2', court_id: 'c2', blackout_type: 'maintenance', start_datetime: '2026-09-16T20:00:00', end_datetime: '2026-09-18T08:00:00' }],
      '2026-09-17',
      courts
    );
    expect(ranges).toEqual([
      { blackoutId: 'b2', courtId: 'c2', startTime: '00:00:00', endTime: '24:00:00', label: 'maintenance' },
    ]);
  });

  it('ignores blackouts on other days and unknown courts', () => {
    expect(
      blackoutsToBlockedRanges(
        [
          { court_id: null, start_datetime: '2026-09-18T09:00:00', end_datetime: '2026-09-18T10:00:00' },
          { court_id: 'zzz', start_datetime: '2026-09-17T09:00:00', end_datetime: '2026-09-17T10:00:00' },
        ],
        '2026-09-17',
        courts
      )
    ).toEqual([]);
  });
});
