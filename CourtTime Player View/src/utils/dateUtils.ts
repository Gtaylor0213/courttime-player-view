/**
 * Parse a date or datetime string as LOCAL time, avoiding the UTC interpretation
 * that causes off-by-one-day bugs.
 *
 * JavaScript's `new Date("2026-04-17")` and `new Date("2026-04-17T00:00:00Z")`
 * interpret the string as UTC, which shifts to the previous day in US timezones.
 * This helper always interprets the date/time components as local time.
 *
 * Handles: "2026-04-17", "2026-04-17T09:00", "2026-04-17T09:00:00",
 *          "2026-04-17T09:00:00.000Z", "2026-04-17 09:00:00+00"
 */
export function parseLocalDate(str: string): Date {
  if (!str) return new Date(NaN);

  // Strip timezone suffix (Z, +00, +00:00, -04:00, etc.) to treat as local
  // Only strip timezone from datetime strings (must contain 'T' separator)
  let cleaned = str.replace(/[Zz]$/, '');
  if (cleaned.includes('T')) {
    cleaned = cleaned.replace(/[+-]\d{2}(:\d{2})?$/, '');
  }

  const [datePart, timePart] = cleaned.split('T');
  const [y, m, d] = datePart.split('-').map(Number);

  if (!timePart) {
    return new Date(y, m - 1, d);
  }

  const timePieces = timePart.split(':').map(Number);
  return new Date(
    y,
    m - 1,
    d,
    timePieces[0] || 0,
    timePieces[1] || 0,
    timePieces[2] || 0
  );
}
