/**
 * Court-type filter shared by web (`useCourtTypeFilter`) and mobile: the list
 * of types present in a facility, in a stable display order, and the courts
 * that match a selected type.
 */

/** Preferred display order for known sports; custom labels append after, sorted. */
const KNOWN_ORDER = ['tennis', 'pickleball', 'padel'];

type CourtLike = { type?: string | null; courtType?: string | null };

export function courtTypeOf(court: CourtLike): string {
  return String(court.courtType ?? court.type ?? 'Tennis').trim();
}

/** Distinct court types in display order (known sports first, then others alphabetically). */
export function getCourtTypes(courts: CourtLike[]): string[] {
  const present = new Map<string, string>(); // lower → display
  for (const c of courts) {
    const t = courtTypeOf(c);
    if (t && !present.has(t.toLowerCase())) present.set(t.toLowerCase(), t);
  }
  const known = KNOWN_ORDER.filter((k) => present.has(k)).map((k) => present.get(k)!);
  const other = [...present.entries()]
    .filter(([k]) => !KNOWN_ORDER.includes(k))
    .map(([, v]) => v)
    .sort((a, b) => a.localeCompare(b));
  return [...known, ...other];
}

/** Courts of `type` (case-insensitive); all courts when `type` is null. */
export function filterCourtsByType<T extends CourtLike>(courts: T[], type: string | null): T[] {
  if (!type) return courts;
  const want = type.toLowerCase();
  return courts.filter((c) => courtTypeOf(c).toLowerCase() === want);
}

/** HH:MM inside a court's peak window for the day (schedule rows from GET /court-config/:id/schedule). */
export function isPeakSlot(
  scheduleRows: Array<Record<string, unknown>> | undefined,
  dayOfWeek: number,
  timeHHMM: string
): boolean {
  if (!scheduleRows || scheduleRows.length === 0) return false;
  const row = scheduleRows.find((r) => Number(r.dayOfWeek ?? r.day_of_week) === dayOfWeek);
  if (!row) return false;
  const start = String(row.primeTimeStart ?? row.prime_time_start ?? '').slice(0, 5);
  const end = String(row.primeTimeEnd ?? row.prime_time_end ?? '').slice(0, 5);
  if (!start || !end) return false;
  const t = timeHHMM.slice(0, 5);
  return t >= start && t < end;
}
