/** My Reservations applies the same client-side filters as web's MyReservations page. */
import { describe, expect, it } from '@jest/globals';
import { filterReservations } from '../src/utils/reservationFilters';

const base = {
  courtId: 'c', userId: 'u', durationMinutes: 60, startTime: '09:00:00', endTime: '10:00:00',
  userName: 'Me', userEmail: 'me@x.com',
};
const rows = [
  { ...base, id: '1', facilityId: 'f1', facilityName: 'Oak Club', courtName: 'Court 1', bookingDate: '2026-10-01', status: 'confirmed' as const },
  { ...base, id: '2', facilityId: 'f2', facilityName: 'Pine Club', courtName: 'Court 2', bookingDate: '2026-10-05', status: 'cancelled' as const },
  { ...base, id: '3', facilityId: 'f1', facilityName: 'Oak Club', courtName: 'Court 3', bookingDate: '2026-10-09', status: 'completed' as const },
];
const none = { status: 'all', facilityId: 'all', fromDate: '', toDate: '', search: '' };

describe('filterReservations', () => {
  it('returns everything with no filters', () => {
    expect(filterReservations(rows, none)).toHaveLength(3);
  });
  it('filters by status, facility and date range', () => {
    expect(filterReservations(rows, { ...none, status: 'cancelled' }).map((r) => r.id)).toEqual(['2']);
    expect(filterReservations(rows, { ...none, facilityId: 'f1' }).map((r) => r.id)).toEqual(['1', '3']);
    expect(filterReservations(rows, { ...none, fromDate: '2026-10-02', toDate: '2026-10-08' }).map((r) => r.id)).toEqual(['2']);
  });
  it('searches court, facility and formatted date, case-insensitively', () => {
    expect(filterReservations(rows, { ...none, search: 'pine' }).map((r) => r.id)).toEqual(['2']);
    expect(filterReservations(rows, { ...none, search: 'court 3' }).map((r) => r.id)).toEqual(['3']);
    expect(filterReservations(rows, { ...none, search: 'Oct 1,' }).map((r) => r.id)).toEqual(['1']);
  });
});
