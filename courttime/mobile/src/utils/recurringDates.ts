/**
 * Weekly recurrence dates between two YYYY-MM-DD dates (inclusive) on the given
 * weekdays — the same expansion the Book tab does for member recurring
 * bookings, shared with the admin Create tab.
 */
export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

export function generateWeeklyDates(startYmd: string, weekdays: string[], endYmd: string): string[] {
  const start = new Date(`${startYmd}T00:00:00`);
  const end = new Date(`${endYmd}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start || weekdays.length === 0) return [];
  const wanted = new Set(weekdays);
  const out: string[] = [];
  const cur = new Date(start);
  while (cur <= end) {
    if (wanted.has(WEEKDAY_NAMES[cur.getDay()]!)) {
      out.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`);
    }
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}
