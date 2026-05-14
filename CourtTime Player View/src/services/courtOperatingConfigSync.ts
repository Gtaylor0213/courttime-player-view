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
      slot_duration: ex.slot_duration ?? ex.slotDuration ?? tpl.slot_duration,
      min_duration: ex.min_duration ?? ex.minDuration ?? tpl.min_duration,
      max_duration: ex.max_duration ?? ex.maxDuration ?? tpl.max_duration,
      buffer_before: ex.buffer_before ?? ex.bufferBefore ?? tpl.buffer_before,
      buffer_after: ex.buffer_after ?? ex.bufferAfter ?? tpl.buffer_after,
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
            slot_duration, min_duration, max_duration, buffer_before, buffer_after
     FROM court_operating_config WHERE court_id = $1 ORDER BY day_of_week ASC`,
    [courtId]
  );
  if (existing.rows.length === 0) return template;
  return mergeFacilityTemplateWithExistingCourtRows(existing.rows, template);
}

async function writeScheduleForCourt(
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
        slot_duration, min_duration, max_duration, buffer_before, buffer_after
      ) VALUES ($1, $2, $3, $4::time, $5::time, $6::time, $7::time, $8, $9, $10, $11, $12, $13)`,
      [
        courtId,
        day.day_of_week,
        day.is_open,
        day.open_time,
        day.close_time,
        day.prime_time_start,
        day.prime_time_end,
        day.prime_time_max_duration,
        day.slot_duration,
        day.min_duration,
        day.max_duration,
        day.buffer_before,
        day.buffer_after,
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
    await writeScheduleForCourt(client, court.id, rows);
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
      await writeScheduleForCourt(client, court.id, rows);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
