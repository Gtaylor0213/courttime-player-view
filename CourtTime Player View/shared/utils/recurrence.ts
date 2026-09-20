/**
 * Weekly recurrence rule for a booking series: the shape the create form
 * collects, the shape booking_series stores, and the single expansion both web
 * and mobile use to turn it into dates.
 *
 * Weekdays are 0=Sunday..6=Saturday, matching Date#getDay, so the expansion
 * needs no name/number translation. Dates are local `YYYY-MM-DD` strings
 * throughout -- a booking on Monday must stay on Monday regardless of the
 * viewer's timezone, so nothing here goes through Date#toISOString.
 */

export const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

export type WeekdayName = (typeof WEEKDAY_NAMES)[number];

/** Weekly rule: which courts, which weekdays, over which range, at what time. */
export interface RecurrenceRule {
  courtIds: string[];
  /** 0=Sunday..6=Saturday. */
  weekdays: number[];
  /** Local `YYYY-MM-DD`, inclusive. */
  startDate: string;
  /** Local `YYYY-MM-DD`, inclusive. */
  endDate: string;
  /** `HH:MM:SS` (24h). */
  startTime: string;
  /** `HH:MM:SS` (24h). */
  endTime: string;
  durationMinutes: number;
}

/** One court on one date -- what a single bookings row covers. */
export interface RecurrenceOccurrence {
  courtId: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** `YYYY-MM-DD` -> local midnight Date, with no UTC round-trip to shift the day. */
export function parseYmd(value: string): Date | null {
  if (!YMD.test(value)) return null;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  // Rejects impossible dates that Date happily rolls over (2025-02-30 -> Mar 2).
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) {
    return null;
  }
  return date;
}

/** Local Date -> `YYYY-MM-DD`. */
export function toYmd(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

/** Accepts weekday names or numbers and normalizes to sorted, unique 0-6 numbers. */
export function normalizeWeekdays(weekdays: ReadonlyArray<number | string>): number[] {
  const out = new Set<number>();
  for (const day of weekdays) {
    if (typeof day === 'number') {
      if (Number.isInteger(day) && day >= 0 && day <= 6) out.add(day);
      continue;
    }
    const byName = WEEKDAY_NAMES.findIndex(
      (name) => name.toLowerCase() === String(day).trim().toLowerCase()
    );
    if (byName >= 0) {
      out.add(byName);
      continue;
    }
    const asNumber = Number(day);
    if (Number.isInteger(asNumber) && asNumber >= 0 && asNumber <= 6) out.add(asNumber);
  }
  return [...out].sort((a, b) => a - b);
}

/** Every date in [startDate, endDate] falling on one of `weekdays`, ascending. */
export function expandWeeklyDates(
  startDate: string,
  endDate: string,
  weekdays: ReadonlyArray<number | string>
): string[] {
  const start = parseYmd(startDate);
  const end = parseYmd(endDate);
  const wanted = new Set(normalizeWeekdays(weekdays));
  if (!start || !end || end < start || wanted.size === 0) return [];

  const dates: string[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    if (wanted.has(cursor.getDay())) dates.push(toYmd(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

/**
 * The full set of bookings a rule describes: one occurrence per court per date,
 * ordered by date then by the rule's own court order so callers can diff two
 * expansions positionally.
 */
export function expandRecurrence(rule: RecurrenceRule): RecurrenceOccurrence[] {
  const dates = expandWeeklyDates(rule.startDate, rule.endDate, rule.weekdays);
  const courtIds = [...new Set(rule.courtIds)].filter(Boolean);
  return dates.flatMap((bookingDate) =>
    courtIds.map((courtId) => ({
      courtId,
      bookingDate,
      startTime: rule.startTime,
      endTime: rule.endTime,
      durationMinutes: rule.durationMinutes,
    }))
  );
}

/** Stable key for matching an occurrence to an existing booking row. */
export function occurrenceKey(courtId: string, bookingDate: string): string {
  return `${bookingDate}|${courtId}`;
}

/**
 * Human summary of a rule, e.g. "Every Mon, Wed - Sep 22 to Dec 12".
 * Used on the calendar's recurring badge and in confirmation copy.
 */
export function describeRecurrence(rule: Pick<RecurrenceRule, 'weekdays' | 'startDate' | 'endDate'>): string {
  const days = normalizeWeekdays(rule.weekdays).map((d) => WEEKDAY_NAMES[d].slice(0, 3));
  if (days.length === 0) return 'Recurring';
  const fmt = (ymd: string) => {
    const date = parseYmd(ymd);
    return date
      ? date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      : ymd;
  };
  const every = days.length === 7 ? 'Every day' : `Every ${days.join(', ')}`;
  return `${every} · ${fmt(rule.startDate)} to ${fmt(rule.endDate)}`;
}

/** Whether two rules describe the same occurrences (ignoring court order). */
export function rulesEqual(a: RecurrenceRule, b: RecurrenceRule): boolean {
  return (
    a.startDate === b.startDate &&
    a.endDate === b.endDate &&
    a.startTime === b.startTime &&
    a.endTime === b.endTime &&
    a.durationMinutes === b.durationMinutes &&
    normalizeWeekdays(a.weekdays).join(',') === normalizeWeekdays(b.weekdays).join(',') &&
    [...new Set(a.courtIds)].sort().join(',') === [...new Set(b.courtIds)].sort().join(',')
  );
}
