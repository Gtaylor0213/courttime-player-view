import { describe, expect, it } from 'vitest';
import {
  blackoutBlockTimeRange,
  layoutReservationBlock,
  reservationBlockDuration,
  reservationBlockName,
  reservationBlockNotes,
} from '../reservationBlock';

describe('reservationBlock', () => {
  it('names a block after the walk-in, then the member, then "Reserved"', () => {
    expect(reservationBlockName({ walkInName: 'Guest Pat', userName: 'Sam Lee' })).toBe('Guest Pat');
    expect(reservationBlockName({ userName: 'Sam Lee' })).toBe('Sam Lee');
    expect(reservationBlockName({})).toBe('Reserved');
  });

  it('names a bulletin activity after its notes', () => {
    expect(reservationBlockName({ bookingType: 'clinic', notes: 'Tuesday Clinic', userName: 'Coach' })).toBe('Tuesday Clinic');
    expect(reservationBlockName({ bookingType: 'match', notes: 'bring balls', userName: 'Sam Lee' })).toBe('Sam Lee');
  });

  it('formats the duration, blackout range and notes lines', () => {
    expect(reservationBlockDuration(120)).toBe('120min');
    expect(blackoutBlockTimeRange(8 * 60, 22 * 60 + 30)).toBe('8:00 AM – 10:30 PM');
    expect(blackoutBlockTimeRange(0, 1440)).toBe('12:00 AM – 12:00 AM');
    expect(reservationBlockNotes('short')).toBe('short');
    expect(reservationBlockNotes('a'.repeat(31))).toBe(`${'a'.repeat(30)}...`);
  });

  const base = { name: 'Sam Lee', typeLabel: 'Fun', isBlocked: false, hasBookingType: true, hasNotes: true, width: 90 };

  it('shows only the name in a short block', () => {
    const layout = layoutReservationBlock({ ...base, height: 20 });
    expect(layout).toMatchObject({ showTypeFull: false, showDurationRow: false, showNotes: false, isCompact: true });
  });

  it('adds type, duration and notes as height allows', () => {
    expect(layoutReservationBlock({ ...base, height: 36 })).toMatchObject({
      showTypeFull: true,
      showDurationRow: false,
    });
    expect(layoutReservationBlock({ ...base, height: 92 })).toMatchObject({
      showTypeFull: true,
      showDurationRow: true,
      showCategoryBadge: false,
      showNotes: true,
    });
  });

  it('never shows a badge or notes on a blocked court', () => {
    const layout = layoutReservationBlock({ ...base, typeLabel: null, isBlocked: true, height: 200 });
    expect(layout).toMatchObject({ showCategoryBadge: false, showNotes: false, showDurationRow: true });
  });
});
