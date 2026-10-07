import {
  bookingWithDetailsToCalendarDetails,
  formatBookingDateYmd,
} from '../src/utils/bookingCalendar';

describe('bookingCalendar', () => {
  it('formats YYYY-MM-DD booking dates without timezone shift', () => {
    expect(formatBookingDateYmd('2026-05-04')).toBe('2026-05-04');
    expect(formatBookingDateYmd('2026-05-04T00:00:00.000Z')).toBe('2026-05-04');
  });

  it('builds calendar details from booking with facility and court names', () => {
    const details = bookingWithDetailsToCalendarDetails({
      courtName: 'Court 1',
      facilityName: 'Riverside Tennis',
      bookingDate: '2026-05-04',
      startTime: '09:00:00',
      endTime: '11:00:00',
      bookingType: 'match',
      notes: ' Doubles ',
    });

    expect(details.title).toBe('Riverside Tennis - Court 1');
    expect(details.bookingDate).toBe('2026-05-04');
    expect(details.startTime).toBe('09:00:00');
    expect(details.endTime).toBe('11:00:00');
    expect(details.location).toBe('Riverside Tennis');
    expect(details.notes).toContain('Booked from CourtTime.');
    expect(details.notes).toContain('Booking type: match.');
    expect(details.notes).toContain('Notes: Doubles');
  });
});
