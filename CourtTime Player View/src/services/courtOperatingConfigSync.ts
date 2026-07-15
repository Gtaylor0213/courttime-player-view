import type { PoolClient } from 'pg';
import { query, getClient } from '../database/connection';
import {
  buildCourtScheduleRowsFromFacilityOperatingHours,
  type CourtOperatingScheduleRow,
} from '../../shared/utils/operatingHours';

function formatPgTime(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'string') {
    const m = value.match(/(\d{1,2}):(\d{2})/);
    if (!m) return null;
    const hh = String(Number(m[1])).padStart(2, '0');
    const mm = String(Number(m[2])).padStart(2, '0');
    return `${hh}:${mm}:00`;
  }
  return null;
}

/** Apply new weekly open/close from facility setup while preserving per-court slot/prime settings. */
function mergeFacilityTemplateWithExistingCourtRows(
  existing: any[],
  template: CourtOperatingScheduleRow[]
): CourtOperatingScheduleRow[] {
  const byDay = new Map<number, any>();
  existing.forEach((row) => byDay.set(Number(row.day_of_week), row));

  return template.map((tpl) => {
    const ex = byDay.get(tpl.day_of_week);
    if (!ex) return { ...tpl };

    const primeStart = formatPgTime(ex.prime_time_start ?? ex.primeTimeStart) ?? tpl.prime_time_start;
    const primeEnd = formatPgTime(ex.prime_time_end ?? ex.primeTimeEnd) ?? tpl.prime_time_end;

    return {
      ...tpl,
      prime_time_start: primeStart,
      prime_time_end: primeEnd,
      prime_time_max_duration:
        ex.prime_time_max_duration ?? ex.primeTimeMaxDuration ?? tpl.prime_time_max_duration,
      min_duration: ex.min_duration ?? ex.minDuration ?? tpl.min_duration,
      max_duration: ex.max_duration ?? ex.maxDuration ?? tpl.max_duration,
    };
  });
}

async function loadMergedScheduleForCourt(
  client: PoolClient,
  courtId: string,
  rawOperatingHours: unknown
): Promise<CourtOperatingScheduleRow[]> {
  const template = buildCourtScheduleRowsFromFacilityOperatingHours(rawOperatingHours);
  const existing = await client.query(
    `SELECT day_of_week, prime_time_start, prime_time_end, prime_time_max_duration,
            min_duration, max_duration
     FROM court_operating_config WHERE court_id = $1 ORDER BY day_of_week ASC`,
    [courtId]
  );
  if (existing.rows.length === 0) return template;
  return mergeFacilityTemplateWithExistingCourtRows(existing.rows, template);
}

export async function writeCourtOperatingSchedule(
  client: PoolClient,
  courtId: string,
  scheduleRows: CourtOperatingScheduleRow[]
): Promise<void> {
  await client.query(`DELETE FROM court_operating_config WHERE court_id = $1`, [courtId]);
  for (const day of scheduleRows) {
    await client.query(
      `INSERT INTO court_operating_config (
        court_id, day_of_week, is_open, open_time, close_time,
        prime_time_start, prime_time_end, prime_time_max_duration,
        min_duration, max_duration
      ) VALUES ($1, $2, $3, $4::time, $5::time, $6::time, $7::time, $8, $9, $10)`,
      [
        courtId,
        day.day_of_week,
        day.is_open,
        day.open_time,
        day.close_time,
        day.prime_time_start,
        day.prime_time_end,
        day.prime_time_max_duration,
        day.min_duration,
        day.max_duration,
      ]
    );
  }
}

/**
 * Sync every court's weekly open/close from facility operating_hours (Court Management source of truth).
 * Merges with existing per-court rows so prime-time and slot settings are preserved.
 */
export async function replaceAllCourtOperatingConfigsForFacilityWithClient(
  client: PoolClient,
  facilityId: string,
  rawOperatingHours: unknown
): Promise<void> {
  const { rows: courts } = await client.query<{ id: string }>(
    `SELECT id FROM courts WHERE facility_id = $1`,
    [facilityId]
  );
  for (const court of courts) {
    const rows = await loadMergedScheduleForCourt(client, court.id, rawOperatingHours);
    await writeCourtOperatingSchedule(client, court.id, rows);
  }
}

/** Seed facility default hours only for courts that have no operating config rows yet (e.g. split children). */
export async function seedCourtsWithoutOperatingConfig(
  client: PoolClient,
  facilityId: string,
  rawOperatingHours: unknown
): Promise<void> {
  const { rows: courtsNeedingSeed } = await client.query<{ id: string }>(
    `SELECT c.id
     FROM courts c
     WHERE c.facility_id = $1
       AND NOT EXISTS (
         SELECT 1 FROM court_operating_config coc WHERE coc.court_id = c.id
       )`,
    [facilityId]
  );
  const template = buildCourtScheduleRowsFromFacilityOperatingHours(rawOperatingHours);
  for (const court of courtsNeedingSeed) {
    await writeCourtOperatingSchedule(client, court.id, template);
  }
}

const SUNDAY_FIRST_DAY_NAMES = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const;

function pgTimeToHHMM(value: unknown, fallback: string): string {
  const formatted = formatPgTime(value);
  return formatted ? formatted.slice(0, 5) : fallback;
}

/**
 * Recompute facility operating_hours as the weekly envelope of its courts' schedules
 * (open if any court is open; earliest open to latest close). Keeps the player-facing
 * hours summary and the calendar day bounds consistent after per-court schedule edits.
 */
export async function syncFacilityOperatingHoursFromCourtsWithClient(
  client: PoolClient,
  facilityId: string
): Promise<void> {
  const facilityRow = await client.query(
    `SELECT operating_hours FROM facilities WHERE id = $1`,
    [facilityId]
  );
  if (facilityRow.rows.length === 0) return;

  // Pin courts that still follow facility defaults to the current hours first so
  // editing one court's schedule doesn't implicitly move every unconfigured court.
  await seedCourtsWithoutOperatingConfig(client, facilityId, facilityRow.rows[0].operating_hours);

  const agg = await client.query(
    `SELECT coc.day_of_week AS "dayOfWeek",
            BOOL_OR(coc.is_open) AS "anyOpen",
            MIN(coc.open_time) FILTER (WHERE coc.is_open) AS "openTime",
            MAX(coc.close_time) FILTER (WHERE coc.is_open) AS "closeTime"
     FROM court_operating_config coc
     JOIN courts c ON c.id = coc.court_id
     WHERE c.facility_id = $1
     GROUP BY coc.day_of_week`,
    [facilityId]
  );
  if (agg.rows.length === 0) return;

  const byDay = new Map<number, any>();
  agg.rows.forEach((row) => byDay.set(Number(row.dayOfWeek), row));

  const operatingHours: Record<string, { open: string; close: string; closed: boolean }> = {};
  SUNDAY_FIRST_DAY_NAMES.forEach((dayName, dow) => {
    const row = byDay.get(dow);
    if (!row || !row.anyOpen) {
      operatingHours[dayName] = { open: '08:00', close: '20:00', closed: true };
    } else {
      operatingHours[dayName] = {
        open: pgTimeToHHMM(row.openTime, '08:00'),
        close: pgTimeToHHMM(row.closeTime, '20:00'),
        closed: false,
      };
    }
  });

  await client.query(
    `UPDATE facilities SET operating_hours = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
    [facilityId, JSON.stringify(operatingHours)]
  );
}

export async function syncFacilityOperatingHoursFromCourts(facilityId: string): Promise<void> {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    await syncFacilityOperatingHoursFromCourtsWithClient(client, facilityId);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function replaceAllCourtOperatingConfigsForFacility(
  facilityId: string,
  rawOperatingHours: unknown
): Promise<void> {
  const { rows: courts } = await query<{ id: string }>(
    `SELECT id FROM courts WHERE facility_id = $1`,
    [facilityId]
  );
  const client = await getClient();
  try {
    await client.query('BEGIN');
    for (const court of courts) {
      const rows = await loadMergedScheduleForCourt(client, court.id, rawOperatingHours);
      await writeCourtOperatingSchedule(client, court.id, rows);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
