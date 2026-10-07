/**
 * Days-in-advance booking window, shared by the rules engine, the web calendar,
 * the mobile calendar, and Club Info so every surface computes it the same way.
 *
 * The window rolls forward on the hour: with a 7-day limit at 5:20 PM on Oct 1, the
 * cutoff is 5:00 PM on Oct 8. A reservation must start and end by the cutoff.
 */

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Latest moment (facility wall clock) a reservation may run until. */
export interface BookingCutoff {
  cutoffYmd: string;
  /** "HH:00", 24-hour */
  cutoffTime: string;
}

/** Shape returned by GET /api/rules/booking-window/:facilityId. */
export interface BookingWindowInfo {
  /** null when the member has no days-in-advance limit (rule off, or admin). */
  maxDaysAhead: number | null;
  todayYmd: string;
  cutoffYmd: string | null;
  cutoffTime: string | null;
}

/** Add N calendar days to a YYYY-MM-DD string (UTC math, no DST skew). */
function addDaysYmd(ymd: string, deltaDays: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const x = new Date(Date.UTC(y, m - 1, d) + deltaDays * 86400000);
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}-${String(x.getUTCDate()).padStart(2, '0')}`;
}

function diffDaysYmd(fromYmd: string, toYmd: string): number {
  const [y1, m1, d1] = fromYmd.split('-').map(Number);
  const [y2, m2, d2] = toYmd.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

/** "17:30" / "17:30:00" → 1050. */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * Cutoff for a facility whose wall clock currently reads nowYmd / nowHour (0–23):
 * the current hour (minutes dropped) plus maxDaysAhead days.
 */
export function computeBookingCutoff(nowYmd: string, nowHour: number, maxDaysAhead: number): BookingCutoff {
  const hour = Math.min(23, Math.max(0, Math.floor(nowHour)));
  return {
    cutoffYmd: addDaysYmd(nowYmd, Math.max(1, Math.floor(maxDaysAhead))),
    cutoffTime: `${String(hour).padStart(2, '0')}:00`,
  };
}

/** Minutes from the start of cutoffYmd to (ymd, time); negative on earlier days. */
function minutesRelativeToCutoffDay(ymd: string, time: string, cutoff: BookingCutoff): number {
  return diffDaysYmd(cutoff.cutoffYmd, ymd) * 1440 + timeToMinutes(time);
}

/**
 * True when a reservation on bookingYmd from startTime to endTime runs past the cutoff.
 * An end at or before the start is treated as crossing midnight.
 */
export function endsAfterBookingCutoff(
  bookingYmd: string,
  startTime: string,
  endTime: string,
  cutoff: BookingCutoff | null | undefined
): boolean {
  if (!cutoff) return false;
  let end = minutesRelativeToCutoffDay(bookingYmd, endTime, cutoff);
  if (timeToMinutes(endTime) <= timeToMinutes(startTime)) end += 1440;
  return end > timeToMinutes(cutoff.cutoffTime);
}

/** True when nothing starting at this slot can fit before the cutoff (used to grey out slots). */
export function slotStartsAtOrAfterCutoff(
  ymd: string,
  startTime: string,
  cutoff: BookingCutoff | null | undefined
): boolean {
  if (!cutoff) return false;
  return minutesRelativeToCutoffDay(ymd, startTime, cutoff) >= timeToMinutes(cutoff.cutoffTime);
}

/** True when no part of this day is bookable yet. */
export function isDateFullyLockedByCutoff(ymd: string, cutoff: BookingCutoff | null | undefined): boolean {
  return slotStartsAtOrAfterCutoff(ymd, '00:00', cutoff);
}

/** Last date with any bookable time (for date-picker max attributes). */
export function lastOpenYmdForCutoff(cutoff: BookingCutoff): string {
  return timeToMinutes(cutoff.cutoffTime) === 0 ? addDaysYmd(cutoff.cutoffYmd, -1) : cutoff.cutoffYmd;
}

/** "2026-10-07" → "Wed, Oct 7". */
export function formatBookableDateLabel(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return ymd;
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${WEEKDAYS[dow]}, ${MONTHS[m - 1]} ${d}`;
}

/** "17:00" → "5:00 PM". */
export function formatHourLabel(time: string): string {
  const minutes = timeToMinutes(time);
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

/** "Thu, Oct 8 at 5:00 PM"; a midnight cutoff reads as "the end of Wed, Oct 7". */
export function formatCutoffLabel(cutoff: BookingCutoff): string {
  if (timeToMinutes(cutoff.cutoffTime) === 0) {
    return `the end of ${formatBookableDateLabel(addDaysYmd(cutoff.cutoffYmd, -1))}`;
  }
  return `${formatBookableDateLabel(cutoff.cutoffYmd)} at ${formatHourLabel(cutoff.cutoffTime)}`;
}

/** "7 days in advance, opening hour by hour". */
export function describeBookingWindow(maxDaysAhead: number | string | null): string {
  const n = Number(maxDaysAhead);
  if (!Number.isFinite(n)) return `${maxDaysAhead ?? ''} days in advance`;
  return `${n} ${n === 1 ? 'day' : 'days'} in advance, opening hour by hour`;
}

/** Message shown when a reservation runs past the cutoff. */
export function bookingWindowBlockedMessage(maxDaysAhead: number, cutoff: BookingCutoff): string {
  return (
    `You can book up to ${describeBookingWindow(maxDaysAhead)}. ` +
    `Right now your reservation must end by ${formatCutoffLabel(cutoff)}.`
  );
}

/** Cutoff from an endpoint payload, or null when there is no limit. */
export function cutoffFromWindowInfo(info: BookingWindowInfo | null | undefined): BookingCutoff | null {
  return info?.maxDaysAhead != null && info.cutoffYmd && info.cutoffTime
    ? { cutoffYmd: info.cutoffYmd, cutoffTime: info.cutoffTime }
    : null;
}
