/**
 * Court blackouts (maintenance blocks) → per-court blocked ranges for one day.
 *
 * Used by the web and mobile calendars and the availability helpers. The
 * day's window comes from `blackoutMinutesOnDate`, snapped outward to 15-minute
 * edges, and a blackout with no court applies to every court.
 */

export interface BlackoutRow {
  id?: string;
  court_id?: string | null;
  courtId?: string | null;
  title?: string | null;
  description?: string | null;
  blackout_type?: string | null;
  blackoutType?: string | null;
  start_datetime?: string;
  startDatetime?: string;
  end_datetime?: string;
  endDatetime?: string;
}

export interface BlockedRange {
  blackoutId: string;
  courtId: string;
  /** HH:MM:SS, day-local */
  startTime: string;
  endTime: string;
  /** The blackout's name (its title, else its type). */
  label: string;
  /** Why the court is closed: the description, else the type when the title is the name. */
  reason: string;
}

function titleCase(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Display name and reason for a blackout, shared by the web and mobile calendars. */
export function describeBlackout(b: BlackoutRow): { name: string; reason: string } {
  const title = (b.title || '').trim();
  const rawType = (b.blackout_type || b.blackoutType || '').trim();
  // "Custom" isn't a reason: the admin's own title says what it is.
  const type = rawType && rawType.toLowerCase() !== 'custom' ? titleCase(rawType) : '';
  const description = (b.description || '').trim();
  const name = title || type || 'Blackout';
  const reason = description || (title && type && type.toLowerCase() !== title.toLowerCase() ? type : '');
  return { name, reason };
}

/**
 * A datetime with an explicit zone (`Z` or ±hh:mm) is parsed as such; a bare
 * `YYYY-MM-DDTHH:MM[:SS]` is taken as facility-local wall time, which is how
 * the admin screens submit blackouts.
 */
export function parseBlackoutDatetime(value: string | undefined | null): Date | null {
  if (!value) return null;
  const s = String(value).trim();
  const bare = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (bare) {
    const [, y, mo, d, h, mi, se] = bare;
    return new Date(+y!, +mo! - 1, +d!, +h!, +mi!, se ? +se : 0);
  }
  const parsed = new Date(s);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function ymdOf(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Minutes of `ymd` (local wall time, [startMin, endMin)) a blackout covers, or null.
 *
 * A multi-day blackout whose end time of day is later than its start time
 * repeats that window on every date in the range: 8am Sep 22 → 10pm Sep 30
 * closes 8am–10pm each day. When the end time is at or before the start time
 * (overnight, or midnight to midnight) it's one continuous closure instead.
 * Keep in step with the server's CRT-006 rule, which uses this too.
 */
export function blackoutMinutesOnDate(
  start: Date,
  end: Date,
  ymd: string
): { startMin: number; endMin: number } | null {
  const startYmd = ymdOf(start);
  const endYmd = ymdOf(end);
  if (ymd < startYmd || ymd > endYmd) return null;
  const startTod = start.getHours() * 60 + start.getMinutes();
  const endTod = end.getHours() * 60 + end.getMinutes();

  let startMin: number;
  let endMin: number;
  if (startYmd === endYmd || endTod > startTod) {
    startMin = startTod;
    endMin = endTod;
  } else {
    startMin = ymd === startYmd ? startTod : 0;
    endMin = ymd === endYmd ? endTod : 24 * 60;
  }
  return endMin > startMin ? { startMin, endMin } : null;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function blackoutsToBlockedRanges(
  blackouts: BlackoutRow[],
  selectedDate: string,
  courtIds: string[]
): BlockedRange[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(selectedDate)) return [];
  const out: BlockedRange[] = [];

  blackouts.forEach((b, index) => {
    const start = parseBlackoutDatetime(b.start_datetime ?? b.startDatetime);
    const end = parseBlackoutDatetime(b.end_datetime ?? b.endDatetime);
    if (!start || !end) return;
    const window = blackoutMinutesOnDate(start, end, selectedDate);
    if (!window) return;
    const startMin = Math.floor(window.startMin / 15) * 15;
    // 11:45pm or later reads as "through midnight".
    const endMin = window.endMin >= 23 * 60 + 45 ? 24 * 60 : Math.ceil(window.endMin / 15) * 15;

    const startTime = `${pad(Math.floor(startMin / 60))}:${pad(startMin % 60)}:00`;
    const endTime = `${pad(Math.floor(endMin / 60))}:${pad(endMin % 60)}:00`;
    const { name: label, reason } = describeBlackout(b);
    const targetCourtId = b.court_id ?? b.courtId ?? null;
    // courtIds ['*'] means the caller already scoped the rows to one court
    // (the per-court availability endpoint), so every row applies.
    const anyCourt = courtIds.length === 1 && courtIds[0] === '*';
    const targets = anyCourt
      ? [targetCourtId ?? '*']
      : targetCourtId
        ? courtIds.includes(targetCourtId) ? [targetCourtId] : []
        : courtIds;
    const blackoutId = b.id || `blackout-${index}`;
    for (const courtId of targets) out.push({ blackoutId, courtId, startTime, endTime, label, reason });
  });

  return out;
}
