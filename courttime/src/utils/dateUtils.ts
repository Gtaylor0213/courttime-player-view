function hasExplicitTimezone(str: string): boolean {
  if (/[Zz]$/.test(str)) return true;
  // Only treat offset as timezone when it follows a time (not "2026-05-01" → "-01").
  return /T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?[+-]\d{2}(?::\d{2})?$/.test(str);
}

function formatWallClockDatetime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/**
 * Parse a date or datetime string for display and calendar logic.
 *
 * - Date-only (`2026-04-17`): local midnight (avoids UTC day-shift from `new Date("2026-04-17")`).
 * - Datetime with timezone (`...Z`, `...+00:00`): real instant via `Date` (API/JSON from Postgres).
 * - Datetime without timezone (`2026-04-17T09:00`): wall-clock components in local time
 *   (datetime-local inputs and TIMESTAMP values returned without offset).
 */
export function parseLocalDate(str: string): Date {
  if (!str) return new Date(NaN);

  const trimmed = str.trim();

  if (hasExplicitTimezone(trimmed)) {
    return new Date(trimmed);
  }

  const normalized = trimmed.replace(' ', 'T');
  const [datePart, timePart] = normalized.split('T');
  const [y, m, d] = datePart.split('-').map(Number);

  if (!timePart) {
    return new Date(y, m - 1, d);
  }

  const timePieces = timePart.split(':').map((part) => parseInt(part, 10));
  return new Date(
    y,
    m - 1,
    d,
    timePieces[0] || 0,
    timePieces[1] || 0,
    timePieces[2] || 0
  );
}

/**
 * Format a date/datetime for `<input type="datetime-local">` in local wall-clock time.
 */
export function toDatetimeLocalInput(str: string): string {
  if (!str) return '';
  const d = parseLocalDate(str);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Normalize datetime-local / API values for storage as TIMESTAMP (no timezone).
 * Converts zoned instants to local wall-clock; passes through timezone-free strings.
 */
export function normalizeLocalDatetimeForStorage(value: string): string {
  if (!value) return value;
  const trimmed = value.trim();

  if (hasExplicitTimezone(trimmed)) {
    const d = new Date(trimmed);
    if (!Number.isNaN(d.getTime())) {
      return formatWallClockDatetime(d);
    }
  }

  const withoutTz = trimmed.replace(' ', 'T');
  return withoutTz.length === 16 ? `${withoutTz}:00` : withoutTz;
}
