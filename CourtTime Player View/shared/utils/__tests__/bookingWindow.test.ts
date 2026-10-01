import { describe, it, expect } from 'vitest';
import {
  bookingWindowBlockedMessage,
  describeBookingWindow,
  formatBookableDateLabel,
  getLastBookableYmd,
  isBeyondBookingWindow,
} from '../bookingWindow';

describe('bookingWindow', () => {
  it('counts today as day one', () => {
    expect(getLastBookableYmd('2026-10-01', 7)).toBe('2026-10-07');
    expect(getLastBookableYmd('2026-10-01', 1)).toBe('2026-10-01');
  });

  it('crosses month and year boundaries', () => {
    expect(getLastBookableYmd('2026-12-28', 7)).toBe('2027-01-03');
  });

  it('blocks only dates after the last bookable date', () => {
    expect(isBeyondBookingWindow('2026-10-07', '2026-10-07')).toBe(false);
    expect(isBeyondBookingWindow('2026-10-08', '2026-10-07')).toBe(true);
    expect(isBeyondBookingWindow('2026-10-08', null)).toBe(false);
  });

  it('formats dates for players', () => {
    expect(formatBookableDateLabel('2026-10-07')).toBe('Wed, Oct 7');
  });

  it('describes the rule and the blocked message with the latest (not earliest) date', () => {
    expect(describeBookingWindow(7)).toBe('7 days in advance (today counts as day 1)');
    expect(describeBookingWindow('1')).toBe('1 day in advance (today counts as day 1)');
    const msg = bookingWindowBlockedMessage(7, '2026-10-07');
    expect(msg).toContain('latest date you can book right now is Wed, Oct 7');
    expect(msg).not.toMatch(/earliest/i);
  });
});
