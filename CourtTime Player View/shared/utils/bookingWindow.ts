/**
 * Days-in-advance booking window, shared by the rules engine, the web calendar,
 * the mobile calendar, and Club Info so every surface counts the window the same way.
 *
 * Today counts as day one: a limit of 7 allows today through 6 days out.
 */

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Add N calendar days to a YYYY-MM-DD string (UTC math, no DST skew). */
function addDaysYmd(ymd: string, deltaDays: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const x = new Date(Date.UTC(y, m - 1, d) + deltaDays * 86400000);
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}-${String(x.getUTCDate()).padStart(2, '0')}`;
}

/** Last calendar date (YYYY-MM-DD) a member may book, given the facility's today and limit. */
export function getLastBookableYmd(todayYmd: string, maxDaysAhead: number): string {
  return addDaysYmd(todayYmd, Math.max(1, Math.floor(maxDaysAhead)) - 1);
}

/** True when bookingYmd falls after the last bookable date. */
export function isBeyondBookingWindow(bookingYmd: string, lastBookableYmd: string | null | undefined): boolean {
  return !!lastBookableYmd && bookingYmd > lastBookableYmd;
}

/** "2026-10-07" → "Wed, Oct 7". */
export function formatBookableDateLabel(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return ymd;
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${WEEKDAYS[dow]}, ${MONTHS[m - 1]} ${d}`;
}

/** "7 days in advance (today counts as day 1)". */
export function describeBookingWindow(maxDaysAhead: number | string | null): string {
  const n = Number(maxDaysAhead);
  if (!Number.isFinite(n)) return `${maxDaysAhead ?? ''} days in advance`;
  return `${n} ${n === 1 ? 'day' : 'days'} in advance (today counts as day 1)`;
}

/** Message shown when a booking falls outside the window. */
export function bookingWindowBlockedMessage(maxDaysAhead: number, lastBookableYmd: string): string {
  return (
    `You can book up to ${describeBookingWindow(maxDaysAhead)}. ` +
    `The latest date you can book right now is ${formatBookableDateLabel(lastBookableYmd)}.`
  );
}

/** Shape returned by GET /api/rules/booking-window/:facilityId. */
export interface BookingWindowInfo {
  /** null when the member has no days-in-advance limit (rule off, or admin). */
  maxDaysAhead: number | null;
  todayYmd: string;
  lastBookableYmd: string | null;
}
