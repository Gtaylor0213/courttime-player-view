import { describe, it, expect } from 'vitest';
import {
  bookingWindowBlockedMessage,
  computeBookingCutoff,
  describeBookingWindow,
  endsAfterBookingCutoff,
  formatBookableDateLabel,
  formatCutoffLabel,
  isDateFullyLockedByCutoff,
  lastOpenYmdForCutoff,
  slotStartsAtOrAfterCutoff,
} from '../bookingWindow';

describe('computeBookingCutoff', () => {
  it('is the current hour plus the limit in days', () => {
    expect(computeBookingCutoff('2026-10-01', 17, 7)).toEqual({ cutoffYmd: '2026-10-08', cutoffTime: '17:00' });
  });

  it('crosses month and year boundaries', () => {
    expect(computeBookingCutoff('2026-12-28', 9, 7)).toEqual({ cutoffYmd: '2027-01-04', cutoffTime: '09:00' });
  });
});

describe('endsAfterBookingCutoff (7 days at 5:20 PM on Oct 1 → cutoff Oct 8 5:00 PM)', () => {
  const cutoff = computeBookingCutoff('2026-10-01', 17, 7);

  it('allows any time before the cutoff day', () => {
    expect(endsAfterBookingCutoff('2026-10-07', '20:00', '22:00', cutoff)).toBe(false);
  });

  it('allows reservations on the cutoff day that end by the cutoff', () => {
    expect(endsAfterBookingCutoff('2026-10-08', '16:00', '17:00', cutoff)).toBe(false);
  });

  it('blocks reservations that end after the cutoff even if they start before it', () => {
    expect(endsAfterBookingCutoff('2026-10-08', '16:30', '17:30', cutoff)).toBe(true);
    expect(endsAfterBookingCutoff('2026-10-08', '17:00', '18:00', cutoff)).toBe(true);
  });

  it('blocks later days', () => {
    expect(endsAfterBookingCutoff('2026-10-09', '08:00', '09:00', cutoff)).toBe(true);
  });

  it('treats an end at or before the start as crossing midnight', () => {
    expect(endsAfterBookingCutoff('2026-10-07', '23:00', '00:00', cutoff)).toBe(false);
    const midnight = computeBookingCutoff('2026-10-01', 0, 7);
    expect(endsAfterBookingCutoff('2026-10-07', '23:00', '00:30', midnight)).toBe(true);
  });

  it('never blocks without a cutoff', () => {
    expect(endsAfterBookingCutoff('2030-01-01', '08:00', '09:00', null)).toBe(false);
  });
});

describe('slot and day locking', () => {
  const cutoff = computeBookingCutoff('2026-10-01', 17, 7);

  it('locks slots starting at or after the cutoff', () => {
    expect(slotStartsAtOrAfterCutoff('2026-10-08', '16:45', cutoff)).toBe(false);
    expect(slotStartsAtOrAfterCutoff('2026-10-08', '17:00', cutoff)).toBe(true);
  });

  it('locks a whole day only once it is entirely past the cutoff', () => {
    expect(isDateFullyLockedByCutoff('2026-10-08', cutoff)).toBe(false);
    expect(isDateFullyLockedByCutoff('2026-10-09', cutoff)).toBe(true);
    const midnight = computeBookingCutoff('2026-10-01', 0, 7);
    expect(isDateFullyLockedByCutoff('2026-10-08', midnight)).toBe(true);
    expect(lastOpenYmdForCutoff(midnight)).toBe('2026-10-07');
    expect(lastOpenYmdForCutoff(cutoff)).toBe('2026-10-08');
  });
});

describe('wording', () => {
  it('formats dates and cutoffs for players', () => {
    expect(formatBookableDateLabel('2026-10-07')).toBe('Wed, Oct 7');
    expect(formatCutoffLabel(computeBookingCutoff('2026-10-01', 17, 7))).toBe('Thu, Oct 8 at 5:00 PM');
    expect(formatCutoffLabel(computeBookingCutoff('2026-10-01', 0, 7))).toBe('the end of Wed, Oct 7');
  });

  it('describes the rule and the blocked message', () => {
    expect(describeBookingWindow(7)).toBe('7 days in advance, opening hour by hour');
    expect(describeBookingWindow('1')).toBe('1 day in advance, opening hour by hour');
    expect(bookingWindowBlockedMessage(7, computeBookingCutoff('2026-10-01', 17, 7))).toBe(
      'You can book up to 7 days in advance, opening hour by hour. Right now your reservation must end by Thu, Oct 8 at 5:00 PM.'
    );
  });
});
