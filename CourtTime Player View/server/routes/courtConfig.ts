/**
 * Court Configuration Routes
 * Manage court operating hours, peak hours, and blackouts
 */

import express from 'express';
import { query, getClient } from '../../src/database/connection';
import {
  getOperatingHoursForDay,
  parseOperatingHoursInput,
  isTruthyClosed,
} from '../../shared/utils/operatingHours';
import { sortCourtsForDisplay } from '../../shared/utils/courtDisplayOrder';
import {
  syncFacilityOperatingHoursFromCourts,
  syncFacilityOperatingHoursFromCourtsWithClient,
} from '../../src/services/courtOperatingConfigSync';
import { normalizeLocalDatetimeForStorage } from '../../src/utils/dateUtils';
import { ensureFacilityAdmin, facilityIdForCourt, facilityIdForBlackout } from '../middleware/facilityAdmin';

const router = express.Router();
const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;

function getFacilityDayConfig(rawOperatingHours: any, dayOfWeek: number): any {
  if (!rawOperatingHours || typeof rawOperatingHours !== 'object') return null;
  const dayName = DAY_NAMES[dayOfWeek];
  return getOperatingHoursForDay(parseOperatingHoursInput(rawOperatingHours), dayName) ?? null;
}

function toHHMM(value: any, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim().toUpperCase();
  const ampmMatch = normalized.match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)/);
  if (ampmMatch) {
    let h = Number(ampmMatch[1]);
    const m = Number(ampmMatch[2]);
    const suffix = ampmMatch[3];
    if (!Number.isFinite(h) || !Number.isFinite(m)) return fallback;
    if (suffix === 'PM' && h !== 12) h += 12;
    if (suffix === 'AM' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  const match = normalized.match(/(\d{1,2}):(\d{2})/);
  if (!match) return fallback;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return fallback;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * GET /api/court-config/facility/:facilityId
 * Get per-court day config for a facility/date.
 */
router.get('/facility/:facilityId', async (req, res, next) => {
  try {
    const { facilityId } = req.params;
    const { date } = req.query;
    const targetDate = typeof date === 'string' ? date : new Date().toISOString().slice(0, 10);
    const dayOfWeek = new Date(`${targetDate}T00:00:00`).getDay();

    const courtsResult = await query(
      `SELECT
         id,
         name,
         court_number as "courtNumber",
         court_type as "courtType",
         parent_court_id as "parentCourtId",
         is_split_court as "isSplitCourt"
       FROM courts
       WHERE facility_id = $1`,
      [facilityId]
    );
    const facilityResult = await query(
      `SELECT operating_hours
       FROM facilities
       WHERE id = $1
       LIMIT 1`,
      [facilityId]
    );
    const operatingHours = parseOperatingHoursInput(facilityResult.rows[0]?.operating_hours || {});
    const facilityDayConfig = getFacilityDayConfig(operatingHours, dayOfWeek) || {};
    const facilityClosed =
      isTruthyClosed(facilityDayConfig?.closed) ||
      isTruthyClosed(facilityDayConfig?.isClosed) ||
      isTruthyClosed(facilityDayConfig?.is_closed) ||
      facilityDayConfig?.isOpen === false ||
      facilityDayConfig?.is_open === false ||
      (typeof facilityDayConfig?.isOpen === 'string' &&
        facilityDayConfig.isOpen.trim().toLowerCase() === 'false') ||
      (typeof facilityDayConfig?.is_open === 'string' &&
        String(facilityDayConfig.is_open).trim().toLowerCase() === 'false');
    const facilityOpenTime = toHHMM(
      facilityDayConfig?.open ||
        facilityDayConfig?.openTime ||
        facilityDayConfig?.open_time ||
        facilityDayConfig?.start ||
        facilityDayConfig?.startTime ||
        facilityDayConfig?.start_time,
      '08:00'
    );
    const facilityCloseTime = toHHMM(
      facilityDayConfig?.close ||
        facilityDayConfig?.closeTime ||
        facilityDayConfig?.close_time ||
        facilityDayConfig?.end ||
        facilityDayConfig?.endTime ||
        facilityDayConfig?.end_time,
      '20:00'
    );

    const configResult = await query(
      `SELECT
         c.id as "courtId",
         coc.is_open as "isOpen",
         coc.open_time as "openTime",
         coc.close_time as "closeTime"
       FROM courts c
       LEFT JOIN court_operating_config coc
         ON coc.court_id = c.id
        AND coc.day_of_week = $2
       WHERE c.facility_id = $1`,
      [facilityId, dayOfWeek]
    );

    const configByCourtId = new Map<string, any>();
    configResult.rows.forEach((row) => configByCourtId.set(row.courtId, row));

    const courtConfigs = sortCourtsForDisplay(courtsResult.rows).map((court) => {
      const config = configByCourtId.get(court.id);
      return {
        courtId: court.id,
        courtName: court.name,
        isOpen: config?.isOpen ?? !facilityClosed,
        openTime: config?.openTime || facilityOpenTime,
        closeTime: config?.closeTime || facilityCloseTime,
        slotDuration: 30,
      };
    });

    res.json({
      success: true,
      date: targetDate,
      dayOfWeek,
      facilityDayHours: {
        isOpen: !facilityClosed,
        open: facilityOpenTime,
        close: facilityCloseTime,
      },
      courtConfigs,
    });
  } catch (error) {
    next(error);
  }
});

// ============================================
// Court Operating Configuration
// ============================================

/**
 * GET /api/court-config/:courtId/schedule
 * Get operating schedule for a court (all days)
 */
router.get('/:courtId/schedule', async (req, res, next) => {
  try {
    const { courtId } = req.params;

    const result = await query(
      `SELECT * FROM court_operating_config
       WHERE court_id = $1
       ORDER BY day_of_week ASC`,
      [courtId]
    );

    // If no config exists, derive defaults from facility operating hours
    if (result.rows.length === 0) {
      // Look up the facility for this court
      const courtResult = await query(
        `SELECT c.facility_id, f.operating_hours FROM courts c JOIN facilities f ON c.facility_id = f.id WHERE c.id = $1`,
        [courtId]
      );
      const opHours = parseOperatingHoursInput(courtResult.rows[0]?.operating_hours || {});
      const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

      const defaults = Array.from({ length: 7 }, (_, i) => {
        const dayConfig = getOperatingHoursForDay(opHours, dayNames[i]) as any;
        const closed =
          !dayConfig ||
          isTruthyClosed(dayConfig?.closed) ||
          isTruthyClosed(dayConfig?.isClosed) ||
          isTruthyClosed(dayConfig?.is_closed) ||
          dayConfig?.isOpen === false ||
          dayConfig?.is_open === false;
        return {
          day_of_week: i,
          is_open: dayConfig ? !closed : true,
          open_time:
            dayConfig?.open ||
            dayConfig?.openTime ||
            dayConfig?.open_time ||
            dayConfig?.start ||
            dayConfig?.startTime ||
            dayConfig?.start_time ||
            '08:00',
          close_time:
            dayConfig?.close ||
            dayConfig?.closeTime ||
            dayConfig?.close_time ||
            dayConfig?.end ||
            dayConfig?.endTime ||
            dayConfig?.end_time ||
            '20:00',
          prime_time_start: null,
          prime_time_end: null,
          prime_time_max_duration: null
        };
      });

      return res.json({
        success: true,
        schedule: defaults,
        isDefault: true
      });
    }

    res.json({
      success: true,
      schedule: result.rows,
      isDefault: false
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/court-config/:courtId/schedule/:dayOfWeek
 * Get operating config for a specific day
 */
router.get('/:courtId/schedule/:dayOfWeek', async (req, res, next) => {
  try {
    const { courtId, dayOfWeek } = req.params;

    const result = await query(
      `SELECT * FROM court_operating_config
       WHERE court_id = $1 AND day_of_week = $2`,
      [courtId, parseInt(dayOfWeek)]
    );

    if (result.rows.length === 0) {
      return res.json({
        success: true,
        config: null,
        message: 'No custom config for this day. Using facility defaults.'
      });
    }

    res.json({
      success: true,
      config: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/court-config/:courtId/schedule
 * Update operating schedule for a court (bulk update all days)
 */
router.put('/:courtId/schedule', async (req, res, next) => {
  try {
    const { courtId } = req.params;
    const { schedule } = req.body;

    const scheduleFacilityId = await facilityIdForCourt(courtId);
    if (!scheduleFacilityId) return res.status(404).json({ success: false, error: 'Court not found' });
    if (!(await ensureFacilityAdmin(scheduleFacilityId, req.user?.userId, res))) return;

    if (!Array.isArray(schedule)) {
      return res.status(400).json({
        success: false,
        error: 'Schedule must be an array of day configurations'
      });
    }

    const client = await getClient();
    try {
      await client.query('BEGIN');

      // Delete existing configs
      await client.query(
        `DELETE FROM court_operating_config WHERE court_id = $1`,
        [courtId]
      );

      // Insert new configs
      for (const day of schedule) {
        await client.query(
          `INSERT INTO court_operating_config (
            court_id, day_of_week, is_open, open_time, close_time,
            prime_time_start, prime_time_end, prime_time_max_duration,
            min_duration, max_duration
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            courtId,
            day.day_of_week,
            day.is_open ?? true,
            day.open_time || '06:00',
            day.close_time || '22:00',
            day.prime_time_start || null,
            day.prime_time_end || null,
            day.prime_time_max_duration || 90,
            day.min_duration || 30,
            day.max_duration || 120
          ]
        );
      }

      // Keep the facility-level hours summary in step with per-court schedules.
      await syncFacilityOperatingHoursFromCourtsWithClient(client, scheduleFacilityId);

      await client.query('COMMIT');

      // Fetch updated schedule
      const result = await query(
        `SELECT * FROM court_operating_config
         WHERE court_id = $1
         ORDER BY day_of_week ASC`,
        [courtId]
      );

      res.json({
        success: true,
        schedule: result.rows
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/court-config/:courtId/schedule/:dayOfWeek
 * Update operating config for a specific day
 */
router.put('/:courtId/schedule/:dayOfWeek', async (req, res, next) => {
  try {
    const { courtId, dayOfWeek } = req.params;
    const {
      isOpen,
      openTime,
      closeTime,
      primeTimeStart,
      primeTimeEnd,
      primeTimeMaxDuration,
      minDuration,
      maxDuration
    } = req.body;

    const dayFacilityId = await facilityIdForCourt(courtId);
    if (!dayFacilityId) return res.status(404).json({ success: false, error: 'Court not found' });
    if (!(await ensureFacilityAdmin(dayFacilityId, req.user?.userId, res))) return;

    const result = await query(
      `INSERT INTO court_operating_config (
        court_id, day_of_week, is_open, open_time, close_time,
        prime_time_start, prime_time_end, prime_time_max_duration,
        min_duration, max_duration
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (court_id, day_of_week)
      DO UPDATE SET
        is_open = EXCLUDED.is_open,
        open_time = EXCLUDED.open_time,
        close_time = EXCLUDED.close_time,
        prime_time_start = EXCLUDED.prime_time_start,
        prime_time_end = EXCLUDED.prime_time_end,
        prime_time_max_duration = EXCLUDED.prime_time_max_duration,
        min_duration = EXCLUDED.min_duration,
        max_duration = EXCLUDED.max_duration,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *`,
      [
        courtId,
        parseInt(dayOfWeek),
        isOpen ?? true,
        openTime || '06:00',
        closeTime || '22:00',
        primeTimeStart || null,
        primeTimeEnd || null,
        primeTimeMaxDuration || 90,
        minDuration || 30,
        maxDuration || 120
      ]
    );

    // Keep the facility-level hours summary in step with per-court schedules.
    await syncFacilityOperatingHoursFromCourts(dayFacilityId);

    res.json({
      success: true,
      config: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

// ============================================
// Court Blackouts
// ============================================

/**
 * GET /api/court-config/:courtId/blackouts
 * Get blackouts for a court
 */
router.get('/:courtId/blackouts', async (req, res, next) => {
  try {
    const { courtId } = req.params;
    const { startDate, endDate, includeExpired } = req.query;

    let sql = `
      SELECT * FROM court_blackouts
      WHERE (court_id = $1 OR court_id IS NULL)
    `;
    const params: any[] = [courtId];

    if (includeExpired !== 'true') {
      sql += ` AND end_datetime > CURRENT_TIMESTAMP`;
    }

    if (startDate) {
      params.push(startDate);
      sql += ` AND end_datetime::date >= $${params.length}::date`;
    }

    if (endDate) {
      params.push(endDate);
      sql += ` AND start_datetime::date <= $${params.length}::date`;
    }

    sql += ` ORDER BY start_datetime ASC`;

    const result = await query(sql, params);

    res.json({
      success: true,
      blackouts: result.rows
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/court-config/facility/:facilityId/blackouts
 * Get all blackouts for a facility (including court-specific)
 */
router.get('/facility/:facilityId/blackouts', async (req, res, next) => {
  try {
    const { facilityId } = req.params;
    const { startDate, endDate, includeExpired } = req.query;

    let sql = `
      SELECT cb.*, c.name as court_name
      FROM court_blackouts cb
      LEFT JOIN courts c ON cb.court_id = c.id
      WHERE cb.facility_id = $1
    `;
    const params: any[] = [facilityId];

    if (includeExpired !== 'true') {
      sql += ` AND cb.end_datetime > CURRENT_TIMESTAMP`;
    }

    if (startDate) {
      params.push(startDate);
      sql += ` AND cb.end_datetime::date >= $${params.length}::date`;
    }

    if (endDate) {
      params.push(endDate);
      sql += ` AND cb.start_datetime::date <= $${params.length}::date`;
    }

    sql += ` ORDER BY cb.start_datetime ASC`;

    const result = await query(sql, params);

    res.json({
      success: true,
      blackouts: result.rows
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/court-config/blackouts
 * Create a new blackout
 */
router.post('/blackouts', async (req, res, next) => {
  try {
    const {
      courtId,
      facilityId,
      blackoutType,
      title,
      description,
      startDatetime,
      endDatetime,
      recurrenceRule,
      createdBy
    } = req.body;

    if (!facilityId || !startDatetime || !endDatetime) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: facilityId, startDatetime, endDatetime'
      });
    }

    if (!(await ensureFacilityAdmin(facilityId, req.user?.userId, res))) return;

    const normalizedStart = normalizeLocalDatetimeForStorage(startDatetime);
    const normalizedEnd = normalizeLocalDatetimeForStorage(endDatetime);

    const result = await query(
      `INSERT INTO court_blackouts (
        court_id, facility_id, blackout_type, title, description,
        start_datetime, end_datetime, recurrence_rule, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        courtId, facilityId, blackoutType || 'maintenance',
        title, description, normalizedStart, normalizedEnd,
        recurrenceRule, createdBy
      ]
    );

    res.status(201).json({
      success: true,
      blackout: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/court-config/blackouts/:blackoutId
 * Update a blackout
 */
router.put('/blackouts/:blackoutId', async (req, res, next) => {
  try {
    const { blackoutId } = req.params;
    const {
      courtId,
      blackoutType,
      title,
      description,
      startDatetime,
      endDatetime,
      recurrenceRule
    } = req.body;

    const blackoutFacilityId = await facilityIdForBlackout(blackoutId);
    if (!blackoutFacilityId) return res.status(404).json({ success: false, error: 'Blackout not found' });
    if (!(await ensureFacilityAdmin(blackoutFacilityId, req.user?.userId, res))) return;

    const result = await query(
      `UPDATE court_blackouts SET
        court_id = COALESCE($1, court_id),
        blackout_type = COALESCE($2, blackout_type),
        title = COALESCE($3, title),
        description = COALESCE($4, description),
        start_datetime = COALESCE($5, start_datetime),
        end_datetime = COALESCE($6, end_datetime),
        recurrence_rule = COALESCE($7, recurrence_rule),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $8
      RETURNING *`,
      [
        courtId,
        blackoutType,
        title,
        description,
        startDatetime != null ? normalizeLocalDatetimeForStorage(startDatetime) : null,
        endDatetime != null ? normalizeLocalDatetimeForStorage(endDatetime) : null,
        recurrenceRule,
        blackoutId,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Blackout not found'
      });
    }

    res.json({
      success: true,
      blackout: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/court-config/blackouts/:blackoutId
 * Delete a blackout
 */
router.delete('/blackouts/:blackoutId', async (req, res, next) => {
  try {
    const { blackoutId } = req.params;

    const blackoutFacilityId = await facilityIdForBlackout(blackoutId);
    if (!blackoutFacilityId) return res.status(404).json({ success: false, error: 'Blackout not found' });
    if (!(await ensureFacilityAdmin(blackoutFacilityId, req.user?.userId, res))) return;

    const result = await query(
      `DELETE FROM court_blackouts WHERE id = $1 RETURNING id`,
      [blackoutId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Blackout not found'
      });
    }

    res.json({
      success: true,
      message: 'Blackout deleted'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/court-config/:courtId/peak-hours
 * Check if a specific time is during peak hours
 */
router.get('/:courtId/peak-hours', async (req, res, next) => {
  try {
    const { courtId } = req.params;
    const { date, time } = req.query;

    if (!date || !time) {
      return res.status(400).json({
        success: false,
        error: 'date and time query parameters are required'
      });
    }

    // Get day of week (0 = Sunday, 6 = Saturday)
    const dayOfWeek = new Date(date as string).getDay();

    const result = await query(
      `SELECT prime_time_start, prime_time_end
       FROM court_operating_config
       WHERE court_id = $1 AND day_of_week = $2`,
      [courtId, dayOfWeek]
    );

    if (result.rows.length === 0 || !result.rows[0].prime_time_start) {
      return res.json({
        success: true,
        isPrimeTime: false,
        message: 'No peak hours configured for this day'
      });
    }

    const { prime_time_start, prime_time_end } = result.rows[0];
    const checkTime = time as string;
    const isPrimeTime = checkTime >= prime_time_start && checkTime < prime_time_end;

    res.json({
      success: true,
      isPrimeTime,
      primeTimeStart: prime_time_start,
      primeTimeEnd: prime_time_end
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/court-config/:courtId/availability
 * Get court availability for a specific date
 */
router.get('/:courtId/availability', async (req, res, next) => {
  try {
    const { courtId } = req.params;
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({
        success: false,
        error: 'date query parameter is required'
      });
    }

    // Get day of week
    const dayOfWeek = new Date(date as string).getDay();

    // Get operating config
    const configResult = await query(
      `SELECT * FROM court_operating_config
       WHERE court_id = $1 AND day_of_week = $2`,
      [courtId, dayOfWeek]
    );
    const facilityResult = await query(
      `SELECT f.operating_hours
       FROM courts c
       JOIN facilities f ON c.facility_id = f.id
       WHERE c.id = $1
       LIMIT 1`,
      [courtId]
    );
    const operatingHours = parseOperatingHoursInput(facilityResult.rows[0]?.operating_hours || {});
    const facilityDayConfig = getFacilityDayConfig(operatingHours, dayOfWeek) || {};
    const facilityClosed =
      isTruthyClosed(facilityDayConfig?.closed) ||
      isTruthyClosed(facilityDayConfig?.isClosed) ||
      isTruthyClosed(facilityDayConfig?.is_closed) ||
      facilityDayConfig?.isOpen === false ||
      facilityDayConfig?.is_open === false ||
      (typeof facilityDayConfig?.isOpen === 'string' &&
        facilityDayConfig.isOpen.trim().toLowerCase() === 'false') ||
      (typeof facilityDayConfig?.is_open === 'string' &&
        String(facilityDayConfig.is_open).trim().toLowerCase() === 'false');
    const facilityOpenTime = toHHMM(
      facilityDayConfig?.open ||
        facilityDayConfig?.openTime ||
        facilityDayConfig?.open_time ||
        facilityDayConfig?.start ||
        facilityDayConfig?.startTime ||
        facilityDayConfig?.start_time,
      '08:00'
    );
    const facilityCloseTime = toHHMM(
      facilityDayConfig?.close ||
        facilityDayConfig?.closeTime ||
        facilityDayConfig?.close_time ||
        facilityDayConfig?.end ||
        facilityDayConfig?.endTime ||
        facilityDayConfig?.end_time,
      '20:00'
    );

    // Get blackouts for this date
    const blackoutResult = await query(
      `SELECT * FROM court_blackouts
       WHERE (court_id = $1 OR court_id IS NULL)
         AND start_datetime::date <= $2::date
         AND end_datetime::date >= $2::date`,
      [courtId, date]
    );

    // Get existing bookings
    const bookingsResult = await query(
      `SELECT start_time, end_time FROM bookings
       WHERE court_id = $1 AND booking_date = $2 AND status != 'cancelled'`,
      [courtId, date]
    );

    const config = configResult.rows[0] || {
      is_open: !facilityClosed,
      open_time: facilityOpenTime,
      close_time: facilityCloseTime
    };

    res.json({
      success: true,
      date,
      isOpen: config.is_open,
      operatingHours: {
        open: config.open_time,
        close: config.close_time
      },
      primeTime: config.prime_time_start ? {
        start: config.prime_time_start,
        end: config.prime_time_end
      } : null,
      slotDuration: 30,
      blackouts: blackoutResult.rows,
      existingBookings: bookingsResult.rows
    });
  } catch (error) {
    next(error);
  }
});

export default router;
