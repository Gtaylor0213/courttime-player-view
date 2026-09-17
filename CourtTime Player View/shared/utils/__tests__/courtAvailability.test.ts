import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  bookedStartTimesFromAvailability,
  buildTimeSlotsFromAvailability,
  to12HourSlotLabel,
} from '../courtAvailability';

describe('courtAvailability', () => {
  const base: Parameters<typeof buildTimeSlotsFromAvailability>[0] = {
    date: '2026-05-20',
    isOpen: true,
    operatingHours: { open: '08:00', close: '10:00' },
    slotDuration: 30,
    existingBookings: [{ startTime: '08:00:00', endTime: '08:30:00' }],
  };

  it('marks booked slots unavailable', () => {
    const slots = buildTimeSlotsFromAvailability(base, '2026-05-20', '2026-05-19');
    const eight = slots.find((s) => s.startTime.startsWith('08:00'));
    const nine = slots.find((s) => s.startTime.startsWith('09:00'));
    expect(eight?.available).toBe(false);
    expect(nine?.available).toBe(true);
  });

  describe('past slots on today', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('keeps a slot open until it ends, then marks it past', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 4, 20, 8, 35)); // 8:35 local
      const slots = buildTimeSlotsFromAvailability(base, '2026-05-20', '2026-05-20');
      const eightThirty = slots.find((s) => s.startTime.startsWith('08:30'));
      const nine = slots.find((s) => s.startTime.startsWith('09:00'));
      expect(eightThirty?.available).toBe(true); // started, not over
      expect(nine?.available).toBe(true);

      vi.setSystemTime(new Date(2026, 4, 20, 9, 0)); // exactly at the slot end
      const later = buildTimeSlotsFromAvailability(base, '2026-05-20', '2026-05-20');
      expect(later.find((s) => s.startTime.startsWith('08:30'))?.available).toBe(false);
      expect(later.find((s) => s.startTime.startsWith('09:00'))?.available).toBe(true);
    });
  });

  it('treats blackouts as occupied slots', () => {
    const slots = buildTimeSlotsFromAvailability(
      {
        ...base,
        date: '2026-05-20',
        blackouts: [
          { court_id: null, title: 'Resurfacing', start_datetime: '2026-05-20T09:00:00', end_datetime: '2026-05-20T09:30:00' },
        ],
      },
      '2026-05-20',
      '2026-05-19'
    );
    expect(slots.find((s) => s.startTime.startsWith('09:00'))?.available).toBe(false);
    expect(slots.find((s) => s.startTime.startsWith('09:30'))?.available).toBe(true);
  });

  it('expands bookings to start times', () => {
    const booked = bookedStartTimesFromAvailability(base);
    expect(booked.has('08:00')).toBe(true);
  });

  it('converts to 12h labels', () => {
    expect(to12HourSlotLabel('13:30')).toBe('1:30 PM');
    expect(to12HourSlotLabel('08:00')).toBe('8:00 AM');
  });
});
