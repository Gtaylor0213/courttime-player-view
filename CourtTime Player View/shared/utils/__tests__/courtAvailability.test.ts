import { describe, expect, it } from 'vitest';
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

  it('expands bookings to start times', () => {
    const booked = bookedStartTimesFromAvailability(base);
    expect(booked.has('08:00')).toBe(true);
  });

  it('converts to 12h labels', () => {
    expect(to12HourSlotLabel('13:30')).toBe('1:30 PM');
    expect(to12HourSlotLabel('08:00')).toBe('8:00 AM');
  });
});
