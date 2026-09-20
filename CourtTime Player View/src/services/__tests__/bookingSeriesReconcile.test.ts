import { describe, it, expect } from 'vitest';
import { reconcileSeries, isNoopPlan, type SeriesInstance } from '../bookingSeriesReconcile';
import type { RecurrenceRule } from '../../../shared/utils/recurrence';

const TODAY = '2026-09-20';

// Mondays and Wednesdays, 6:00-7:30pm, on one court, Sep 21 - Oct 5.
const rule: RecurrenceRule = {
  courtIds: ['court-a'],
  weekdays: [1, 3],
  startDate: '2026-09-21',
  endDate: '2026-10-05',
  startTime: '18:00:00',
  endTime: '19:30:00',
  durationMinutes: 90,
};

const DATES = ['2026-09-21', '2026-09-23', '2026-09-28', '2026-09-30', '2026-10-05'];

function instance(date: string, over: Partial<SeriesInstance> = {}): SeriesInstance {
  return {
    id: `b-${date}-${over.courtId ?? 'court-a'}`,
    courtId: 'court-a',
    bookingDate: date,
    startTime: '18:00:00',
    endTime: '19:30:00',
    durationMinutes: 90,
    status: 'confirmed',
    ...over,
  };
}

const existing = DATES.map((d) => instance(d));

describe('reconcileSeries', () => {
  it('is a no-op when nothing changed', () => {
    const plan = reconcileSeries({ instances: existing, rule, today: TODAY });
    expect(plan.keep).toHaveLength(5);
    expect(isNoopPlan(plan)).toBe(true);
  });

  it('reshapes every instance when the time moves', () => {
    const plan = reconcileSeries({
      instances: existing,
      rule: { ...rule, startTime: '19:00:00', endTime: '20:30:00' },
      today: TODAY,
    });
    expect(plan.reshape).toHaveLength(5);
    expect(plan.reshape[0].to.startTime).toBe('19:00:00');
    expect(plan.create).toHaveLength(0);
    expect(plan.cancel).toHaveLength(0);
  });

  it('creates the added dates when the range is extended', () => {
    const plan = reconcileSeries({
      instances: existing,
      rule: { ...rule, endDate: '2026-10-12' },
      today: TODAY,
    });
    expect(plan.create.map((c) => c.bookingDate)).toEqual(['2026-10-07', '2026-10-12']);
    expect(plan.cancel).toHaveLength(0);
  });

  it('cancels the trailing dates when the range is shortened', () => {
    const plan = reconcileSeries({
      instances: existing,
      rule: { ...rule, endDate: '2026-09-28' },
      today: TODAY,
    });
    expect(plan.cancel.map((c) => c.bookingDate)).toEqual(['2026-09-30', '2026-10-05']);
    expect(plan.create).toHaveLength(0);
  });

  it('swaps instances when a weekday is exchanged', () => {
    const plan = reconcileSeries({
      instances: existing,
      rule: { ...rule, weekdays: [1, 4] }, // Wednesdays out, Thursdays in
      today: TODAY,
    });
    expect(plan.cancel.map((c) => c.bookingDate)).toEqual(['2026-09-23', '2026-09-30']);
    expect(plan.create.map((c) => c.bookingDate)).toEqual([
      '2026-09-24',
      '2026-10-01',
    ]);
  });

  it('adding a court creates a parallel set and keeps the original', () => {
    const plan = reconcileSeries({
      instances: existing,
      rule: { ...rule, courtIds: ['court-a', 'court-b'] },
      today: TODAY,
    });
    expect(plan.keep).toHaveLength(5);
    expect(plan.create).toHaveLength(5);
    expect(new Set(plan.create.map((c) => c.courtId))).toEqual(new Set(['court-b']));
  });

  it('removing a court cancels only that court', () => {
    const twoCourts = [
      ...existing,
      ...DATES.map((d) => instance(d, { courtId: 'court-b', id: `b-${d}-court-b` })),
    ];
    const plan = reconcileSeries({ instances: twoCourts, rule, today: TODAY });
    expect(plan.cancel.every((c) => c.courtId === 'court-b')).toBe(true);
    expect(plan.cancel).toHaveLength(5);
    expect(plan.keep).toHaveLength(5);
  });

  it('cancels an unchecked date and never re-creates it', () => {
    const plan = reconcileSeries({
      instances: existing,
      rule,
      excludeDates: ['2026-09-28'],
      today: TODAY,
    });
    expect(plan.cancel.map((c) => c.bookingDate)).toEqual(['2026-09-28']);
    expect(plan.create).toHaveLength(0);
  });

  it('leaves an individually-moved instance alone when the rule is unchanged', () => {
    const drifted = existing.map((i) =>
      i.bookingDate === '2026-09-28'
        ? { ...i, startTime: '20:00:00', endTime: '21:30:00' }
        : i
    );
    const plan = reconcileSeries({ instances: drifted, rule, today: TODAY });
    // It differs from the rule, so an edit that touches the series pulls it back.
    expect(plan.reshape.map((r) => r.booking.bookingDate)).toEqual(['2026-09-28']);
  });

  describe('scope windows', () => {
    it('"this and following" ignores earlier instances entirely', () => {
      const plan = reconcileSeries({
        instances: existing,
        rule: { ...rule, startTime: '19:00:00', endTime: '20:30:00' },
        fromDate: '2026-09-28',
        today: TODAY,
      });
      expect(plan.reshape.map((r) => r.booking.bookingDate)).toEqual([
        '2026-09-28',
        '2026-09-30',
        '2026-10-05',
      ]);
      expect(plan.keep).toHaveLength(0);
      expect(plan.cancel).toHaveLength(0);
    });

    it('clamps with toDate as well', () => {
      const plan = reconcileSeries({
        instances: existing,
        rule,
        fromDate: '2026-09-23',
        toDate: '2026-09-28',
        today: TODAY,
      });
      expect(plan.keep.map((k) => k.bookingDate)).toEqual(['2026-09-23', '2026-09-28']);
    });
  });

  describe('past instances', () => {
    const withPast = [instance('2026-09-14'), instance('2026-09-16'), ...existing];
    const pastRule = { ...rule, startDate: '2026-09-14' };

    it('protects them by default', () => {
      const plan = reconcileSeries({
        instances: withPast,
        rule: { ...pastRule, startTime: '19:00:00', endTime: '20:30:00' },
        today: TODAY,
      });
      expect(plan.untouchedPast.map((p) => p.bookingDate)).toEqual([
        '2026-09-14',
        '2026-09-16',
      ]);
      expect(plan.reshape.every((r) => r.booking.bookingDate >= TODAY)).toBe(true);
    });

    it('never back-fills a date that has already passed', () => {
      const plan = reconcileSeries({
        instances: existing,
        rule: pastRule,
        today: TODAY,
      });
      expect(plan.create).toHaveLength(0);
    });

    it('rewrites them when includePast is set', () => {
      const plan = reconcileSeries({
        instances: withPast,
        rule: { ...pastRule, startTime: '19:00:00', endTime: '20:30:00' },
        today: TODAY,
        includePast: true,
      });
      expect(plan.untouchedPast).toHaveLength(0);
      expect(plan.reshape).toHaveLength(7);
    });
  });

  it('ignores already-cancelled rows and re-creates the date if the rule covers it', () => {
    const withCancelled = existing.map((i) =>
      i.bookingDate === '2026-09-30' ? { ...i, status: 'cancelled' } : i
    );
    const plan = reconcileSeries({ instances: withCancelled, rule, today: TODAY });
    expect(plan.create.map((c) => c.bookingDate)).toEqual(['2026-09-30']);
    expect(plan.cancel).toHaveLength(0);
  });

  it('treats a duplicate live row on the same court and date as surplus', () => {
    const dupe = [...existing, { ...instance('2026-09-21'), id: 'dupe' }];
    const plan = reconcileSeries({ instances: dupe, rule, today: TODAY });
    expect(plan.cancel.map((c) => c.id)).toEqual(['dupe']);
  });
});
