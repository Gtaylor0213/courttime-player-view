/**
 * Grouping for the admin Reservations list: rows that belong to a recurring
 * series collapse under one header (web's BookingManagement series rows).
 */
export interface SeriesGroupable {
  id: string;
  seriesId?: string | null;
  isRecurring?: boolean;
  bookingDate: string;
  startTime: string;
}

export type AdminBookingGroup<T extends SeriesGroupable> =
  | { kind: 'single'; booking: T }
  | { kind: 'series'; seriesId: string; bookings: T[] };

/** Preserves first-seen order; series members are sorted by date then time. */
export function groupBookingsBySeries<T extends SeriesGroupable>(rows: T[]): AdminBookingGroup<T>[] {
  const out: AdminBookingGroup<T>[] = [];
  const bySeries = new Map<string, T[]>();
  for (const row of rows) {
    const seriesId = row.isRecurring && row.seriesId ? row.seriesId : null;
    if (!seriesId) {
      out.push({ kind: 'single', booking: row });
      continue;
    }
    const existing = bySeries.get(seriesId);
    if (existing) {
      existing.push(row);
    } else {
      const list = [row];
      bySeries.set(seriesId, list);
      out.push({ kind: 'series', seriesId, bookings: list });
    }
  }
  for (const group of out) {
    if (group.kind === 'series') {
      group.bookings.sort((a, b) => `${a.bookingDate} ${a.startTime}`.localeCompare(`${b.bookingDate} ${b.startTime}`));
    }
  }
  return out;
}

/** Minutes between two HH:MM[:SS] times; 0 when unparsable. */
export function minutesBetween(startTime: string, endTime: string): number {
  const toMin = (t: string) => {
    const [h, m] = String(t).split(':').map(Number);
    return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : NaN;
  };
  const diff = toMin(endTime) - toMin(startTime);
  return Number.isFinite(diff) && diff > 0 ? diff : 0;
}
