/**
 * Court Configuration Routes
 * Manage court operating hours, prime time, and blackouts
 */

import express from 'express';
import { pool } from '../../src/database/connection';

const router = express.Router();

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

    const result = await pool.query(
      `SELECT * FROM court_operating_config
       WHERE court_id = $1
       ORDER BY day_of_week ASC`,
      [courtId]
    );

    // If no config exists, return defaults
    if (result.rows.length === 0) {
      const defaults = Array.from({ length: 7 }, (_, i) => ({
        day_of_week: i,
        is_open: i !== 0, // Closed on Sunday by default
        open_time: '06:00',
        close_time: '22:00',
        prime_time_start: '17:00',
        prime_time_end: '20:00',
        prime_time_max_duration: 90,
        slot_duration: 30,
        buffer_minutes: 0
      }));

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

    const result = await pool.query(
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

    if (!Array.isArray(schedule)) {
      return res.status(400).json({
        success: false,
        error: 'Schedule must be an array of day configurations'
      });
    }

    const client = await pool.connect();
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
            slot_duration, buffer_minutes
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            courtId,
            day.day_of_week,
            day.is_open ?? true,
            day.open_time || '06:00',
            day.close_time || '22:00',
            day.prime_time_start,
            day.prime_time_end,
            day.prime_time_max_duration,
            day.slot_duration || 30,
            day.buffer_minutes || 0
          ]
        );
      }

      await client.query('COMMIT');

      // Fetch updated schedule
      const result = await pool.query(
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
      slotDuration,
      bufferMinutes
    } = req.body;

    const result = await pool.query(
      `INSERT INTO court_operating_config (
        court_id, day_of_week, is_open, open_time, close_time,
        prime_time_start, prime_time_end, prime_time_max_duration,
        slot_duration, buffer_minutes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (court_id, day_of_week)
      DO UPDATE SET
        is_open = EXCLUDED.is_open,
        open_time = EXCLUDED.open_time,
        close_time = EXCLUDED.close_time,
        prime_time_start = EXCLUDED.prime_time_start,
        prime_time_end = EXCLUDED.prime_time_end,
        prime_time_max_duration = EXCLUDED.prime_time_max_duration,
        slot_duration = EXCLUDED.slot_duration,
        buffer_minutes = EXCLUDED.buffer_minutes,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *`,
      [
        courtId,
        parseInt(dayOfWeek),
        isOpen ?? true,
        openTime || '06:00',
        closeTime || '22:00',
        primeTimeStart,
        primeTimeEnd,
        primeTimeMaxDuration,
        slotDuration || 30,
        bufferMinutes || 0
      ]
    );

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

    let query = `
      SELECT * FROM court_blackouts
      WHERE (court_id = $1 OR court_id IS NULL)
    `;
    const params: any[] = [courtId];

    if (includeExpired !== 'true') {
      query += ` AND end_datetime > CURRENT_TIMESTAMP`;
    }

    if (startDate) {
      params.push(startDate);
      query += ` AND end_datetime >= $${params.length}::timestamp`;
    }

    if (endDate) {
      params.push(endDate);
      query += ` AND start_datetime <= $${params.length}::timestamp`;
    }

    query += ` ORDER BY start_datetime ASC`;

    const result = await pool.query(query, params);

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

    let query = `
      SELECT cb.*, c.name as court_name
      FROM court_blackouts cb
      LEFT JOIN courts c ON cb.court_id = c.id
      WHERE cb.facility_id = $1
    `;
    const params: any[] = [facilityId];

    if (includeExpired !== 'true') {
      query += ` AND cb.end_datetime > CURRENT_TIMESTAMP`;
    }

    if (startDate) {
      params.push(startDate);
      query += ` AND cb.end_datetime >= $${params.length}::timestamp`;
    }

    if (endDate) {
      params.push(endDate);
      query += ` AND cb.start_datetime <= $${params.length}::timestamp`;
    }

    query += ` ORDER BY cb.start_datetime ASC`;

    const result = await pool.query(query, params);

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

    const result = await pool.query(
      `INSERT INTO court_blackouts (
        court_id, facility_id, blackout_type, title, description,
        start_datetime, end_datetime, recurrence_rule, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        courtId, facilityId, blackoutType || 'maintenance',
        title, description, startDatetime, endDatetime,
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

    const result = await pool.query(
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
      [courtId, blackoutType, title, description, startDatetime, endDatetime, recurrenceRule, blackoutId]
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

    const result = await pool.query(
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
 * GET /api/court-config/:courtId/prime-time
 * Check if a specific time is during prime time
 */
router.get('/:courtId/prime-time', async (req, res, next) => {
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

    const result = await pool.query(
      `SELECT prime_time_start, prime_time_end
       FROM court_operating_config
       WHERE court_id = $1 AND day_of_week = $2`,
      [courtId, dayOfWeek]
    );

    if (result.rows.length === 0 || !result.rows[0].prime_time_start) {
      return res.json({
        success: true,
        isPrimeTime: false,
        message: 'No prime time configured for this day'
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
    const configResult = await pool.query(
      `SELECT * FROM court_operating_config
       WHERE court_id = $1 AND day_of_week = $2`,
      [courtId, dayOfWeek]
    );

    // Get blackouts for this date
    const blackoutResult = await pool.query(
      `SELECT * FROM court_blackouts
       WHERE (court_id = $1 OR court_id IS NULL)
         AND start_datetime::date <= $2::date
         AND end_datetime::date >= $2::date`,
      [courtId, date]
    );

    // Get existing bookings
    const bookingsResult = await pool.query(
      `SELECT start_time, end_time FROM bookings
       WHERE court_id = $1 AND booking_date = $2 AND status != 'cancelled'`,
      [courtId, date]
    );

    const config = configResult.rows[0] || {
      is_open: true,
      open_time: '06:00',
      close_time: '22:00',
      slot_duration: 30
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
      slotDuration: config.slot_duration,
      bufferMinutes: config.buffer_minutes,
      blackouts: blackoutResult.rows,
      existingBookings: bookingsResult.rows
    });
  } catch (error) {
    next(error);
  }
});

export default router;
