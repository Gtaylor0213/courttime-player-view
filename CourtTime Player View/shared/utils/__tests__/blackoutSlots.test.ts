import { describe, expect, it } from 'vitest';
import { blackoutMinutesOnDate, blackoutsToBlockedRanges, describeBlackout, parseBlackoutDatetime } from '../blackoutSlots';

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
      { blackoutId: 'b2', courtId: 'c2', startTime: '00:00:00', endTime: '24:00:00', label: 'Maintenance', reason: '' },
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

describe('describeBlackout', () => {
  it('uses the title as the name and the description as the reason', () => {
    expect(describeBlackout({ title: 'Resurfacing', blackout_type: 'maintenance', description: 'New acrylic coat' }))
      .toEqual({ name: 'Resurfacing', reason: 'New acrylic coat' });
  });
  it('falls back to the type as the reason when there is no description', () => {
    expect(describeBlackout({ title: 'Club Championship', blackout_type: 'tournament' }))
      .toEqual({ name: 'Club Championship', reason: 'Tournament' });
  });
  it('never shows "Custom" as a reason', () => {
    expect(describeBlackout({ title: 'Begins Oct 1st', blackout_type: 'custom' }))
      .toEqual({ name: 'Begins Oct 1st', reason: '' });
    expect(describeBlackout({ blackout_type: 'custom' })).toEqual({ name: 'Blackout', reason: '' });
  });
  it('names an untitled blackout after its type', () => {
    expect(describeBlackout({ blackout_type: 'weather', description: 'Courts flooded' }))
      .toEqual({ name: 'Weather', reason: 'Courts flooded' });
    expect(describeBlackout({})).toEqual({ name: 'Blackout', reason: '' });
  });
});

describe('blackoutMinutesOnDate', () => {
  const at = (s: string) => parseBlackoutDatetime(s)!;

  it('repeats a multi-day blackout\'s start–end times on every day', () => {
    const start = at('2026-09-22T08:00:00');
    const end = at('2026-09-30T22:00:00');
    for (const day of ['2026-09-22', '2026-09-25', '2026-09-30']) {
      expect(blackoutMinutesOnDate(start, end, day)).toEqual({ startMin: 8 * 60, endMin: 22 * 60 });
    }
    expect(blackoutMinutesOnDate(start, end, '2026-09-21')).toBeNull();
    expect(blackoutMinutesOnDate(start, end, '2026-10-01')).toBeNull();
  });

  it('treats an overnight range as one continuous closure', () => {
    const start = at('2026-09-22T20:00:00');
    const end = at('2026-09-24T06:00:00');
    expect(blackoutMinutesOnDate(start, end, '2026-09-22')).toEqual({ startMin: 20 * 60, endMin: 24 * 60 });
    expect(blackoutMinutesOnDate(start, end, '2026-09-23')).toEqual({ startMin: 0, endMin: 24 * 60 });
    expect(blackoutMinutesOnDate(start, end, '2026-09-24')).toEqual({ startMin: 0, endMin: 6 * 60 });
  });

  it('treats midnight-to-midnight as whole days', () => {
    const start = at('2026-09-22T00:00:00');
    const end = at('2026-09-24T00:00:00');
    expect(blackoutMinutesOnDate(start, end, '2026-09-23')).toEqual({ startMin: 0, endMin: 24 * 60 });
    expect(blackoutMinutesOnDate(start, end, '2026-09-24')).toBeNull();
  });
});

describe('blackoutsToBlockedRanges daily window', () => {
  it('blocks 8am–10pm on a middle day of a multi-day blackout', () => {
    const ranges = blackoutsToBlockedRanges(
      [{ id: 'b9', court_id: null, title: 'Begins Oct 1st', blackout_type: 'custom', start_datetime: '2026-09-22T08:00:00', end_datetime: '2026-09-30T22:00:00' }],
      '2026-09-25',
      ['c1']
    );
    expect(ranges).toEqual([
      { blackoutId: 'b9', courtId: 'c1', startTime: '08:00:00', endTime: '22:00:00', label: 'Begins Oct 1st', reason: '' },
    ]);
  });
});
