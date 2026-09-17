/**
 * Court blackouts (maintenance blocks) → per-court blocked ranges for one day.
 *
 * Mirrors the web calendar's handling (CourtCalendarView `addBlackoutSlots`):
 * the range is clamped to the selected day and snapped outward to 15-minute
 * edges, and a blackout with no court applies to every court.
 */

export interface BlackoutRow {
  id?: string;
  court_id?: string | null;
  courtId?: string | null;
  title?: string | null;
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
  label: string;
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

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function blackoutsToBlockedRanges(
  blackouts: BlackoutRow[],
  selectedDate: string,
  courtIds: string[]
): BlockedRange[] {
  const [y, m, d] = selectedDate.split('-').map(Number);
  if (!y || !m || !d) return [];
  const dayStart = new Date(y, m - 1, d, 0, 0, 0, 0);
  const dayEnd = new Date(y, m - 1, d, 23, 59, 59, 999);
  const out: BlockedRange[] = [];

  blackouts.forEach((b, index) => {
    const start = parseBlackoutDatetime(b.start_datetime ?? b.startDatetime);
    const end = parseBlackoutDatetime(b.end_datetime ?? b.endDatetime);
    if (!start || !end) return;
    if (end <= dayStart || start > dayEnd) return;

    const effStart = start < dayStart ? dayStart : start;
    const effEnd = end > dayEnd ? dayEnd : end;
    const startMin = effStart.getHours() * 60 + Math.floor(effStart.getMinutes() / 15) * 15;
    let endMin = effEnd.getHours() * 60 + Math.ceil(effEnd.getMinutes() / 15) * 15;
    if (effEnd.getHours() === 23 && effEnd.getMinutes() >= 45) endMin = 24 * 60;
    if (endMin <= startMin) return;

    const startTime = `${pad(Math.floor(startMin / 60))}:${pad(startMin % 60)}:00`;
    const endTime = `${pad(Math.floor(endMin / 60))}:${pad(endMin % 60)}:00`;
    const label = b.title || b.blackout_type || b.blackoutType || 'Blackout';
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
    for (const courtId of targets) out.push({ blackoutId, courtId, startTime, endTime, label });
  });

  return out;
}
