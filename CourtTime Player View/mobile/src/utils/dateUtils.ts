/**
 * Parse a date or datetime string as LOCAL time to avoid UTC day-shift bugs.
 */
export function parseLocalDate(str: string): Date {
  if (!str) return new Date(NaN);

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

/**
 * Format a Date to YYYY-MM-DD in local time.
 */
export function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
