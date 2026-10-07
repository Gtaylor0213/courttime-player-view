/**
 * Date-range and grouping helpers for the week/month schedule overview.
 *
 * Web renders this as a time grid (`WeekMonthCalendarView`); mobile renders an
 * agenda and a month grid. The range maths and grouping are the same either
 * way, so they live here rather than being written twice.
 */

/** Local calendar date as YYYY-MM-DD — never UTC, which shifts the day. */
export function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Monday-anchored, matching web's week grid. */
export function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const dow = d.getDay(); // 0 = Sunday
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  d.setHours(0, 0, 0, 0);
  return d;
}

export function getWeekDays(date: Date): Date[] {
  const start = getWeekStart(date);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });
}

/** Every day in the month containing `date`. */
export function getMonthDays(date: Date): Date[] {
  const year = date.getFullYear();
  const month = date.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  return Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1));
}

/**
 * Leading blanks before the 1st in a Monday-anchored month grid, so the first
 * row lines up under the right weekday.
 */
export function getMonthLeadingBlankCount(date: Date): number {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const dow = first.getDay();
  return dow === 0 ? 6 : dow - 1;
}

/** The dates an overview needs to fetch, as YYYY-MM-DD. */
export function getOverviewDateStrings(viewMode: 'week' | 'month', date: Date): string[] {
  const days = viewMode === 'week' ? getWeekDays(date) : getMonthDays(date);
  return days.map(toDateStr);
}

/** Step the anchor date by one week or month. */
export function shiftOverviewDate(
  viewMode: 'week' | 'month',
  date: Date,
  direction: 'prev' | 'next'
): Date {
  const d = new Date(date);
  const delta = direction === 'next' ? 1 : -1;
  if (viewMode === 'week') {
    d.setDate(d.getDate() + 7 * delta);
  } else {
    // Anchor to the 1st first: stepping from the 31st would skip short months.
    d.setDate(1);
    d.setMonth(d.getMonth() + delta);
  }
  return d;
}

export interface OverviewBooking {
  bookingDate: string;
  startTime?: string;
  endTime?: string;
  courtName?: string;
  bookingType?: string;
  status?: string;
  [key: string]: unknown;
}

/** Bookings keyed by their YYYY-MM-DD date, each day sorted by start time. */
export function groupBookingsByDate<T extends OverviewBooking>(
  bookings: T[]
): Record<string, T[]> {
  const map: Record<string, T[]> = {};
  for (const booking of bookings) {
    const key = booking.bookingDate;
    if (!key) continue;
    (map[key] ||= []).push(booking);
  }
  for (const key of Object.keys(map)) {
    map[key].sort((a, b) => String(a.startTime || '').localeCompare(String(b.startTime || '')));
  }
  return map;
}

/** A booking's label for the overview: "9:00 AM · Court 1". */
export function formatOverviewSlotLabel(booking: OverviewBooking): string {
  const time = formatTimeLabel(booking.startTime);
  const court = String(booking.courtName || '').trim();
  return [time, court].filter(Boolean).join(' · ');
}

/** "09:00:00" and "09:00" both become "9:00 AM". */
export function formatTimeLabel(value: unknown): string {
  const s = String(value ?? '').trim();
  if (!s) return '';
  const [h, m] = s.split(':').map(Number);
  if (!Number.isFinite(h)) return s;
  const period = h >= 12 ? 'PM' : 'AM';
  const minutes = Number.isFinite(m) ? m : 0;
  return `${h % 12 || 12}:${String(minutes).padStart(2, '0')} ${period}`;
}
