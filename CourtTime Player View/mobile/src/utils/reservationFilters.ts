/**
 * Client-side filtering for My Reservations — the same predicate web's
 * MyReservations page applies over the fetched list.
 */
import type { BookingWithDetails } from '../types/database';

export function formatReservationDate(ymd: string): string {
  const d = new Date(`${String(ymd).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return String(ymd);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

export interface ReservationFilters {
  status: string;
  facilityId: string;
  fromDate: string;
  toDate: string;
  search: string;
}

/** Same predicate web applies client-side over the fetched list. Exported for tests. */
export function filterReservations(
  reservations: BookingWithDetails[],
  filters: ReservationFilters
): BookingWithDetails[] {
  const q = filters.search.trim().toLowerCase();
  return reservations.filter((r) => {
    const date = String(r.bookingDate).slice(0, 10);
    if (filters.status !== 'all' && r.status !== filters.status) return false;
    if (filters.facilityId !== 'all' && r.facilityId !== filters.facilityId) return false;
    if (filters.fromDate && date < filters.fromDate) return false;
    if (filters.toDate && date > filters.toDate) return false;
    if (q) {
      const haystack = [r.courtName, r.facilityName, formatReservationDate(date)].map((v) => String(v ?? '').toLowerCase());
      if (!haystack.some((v) => v.includes(q))) return false;
    }
    return true;
  });
}

