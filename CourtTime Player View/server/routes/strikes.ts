/**
 * Strike Management Routes
 * Manage account strikes for no-shows and late cancellations
 */

import express from 'express';
import { pool } from '../../src/database/connection';
import { sendStrikeIssuedEmail, sendStrikeRevokedEmail, sendLockoutEmail } from '../../src/services/emailService';
import { notificationService } from '../../src/services/notificationService';

const router = express.Router();

/**
 * GET /api/strikes/facility/:facilityId
 * Get all strikes for a facility
 */
router.get('/facility/:facilityId', async (req, res, next) => {
  try {
    const { facilityId } = req.params;
    const { activeOnly, userId } = req.query;

    let query = `
      SELECT s.*, u.first_name, u.last_name, u.email,
             b.booking_date, b.start_time, c.name as court_name
      FROM account_strikes s
      LEFT JOIN users u ON s.user_id = u.id
      LEFT JOIN bookings b ON s.related_booking_id = b.id
      LEFT JOIN courts c ON b.court_id = c.id
      WHERE s.facility_id = $1
    `;
    const params: any[] = [facilityId];

    if (activeOnly === 'true') {
      query += ` AND s.revoked = false AND (s.expires_at IS NULL OR s.expires_at > CURRENT_TIMESTAMP)`;
    }

    if (userId) {
      params.push(userId);
      query += ` AND s.user_id = $${params.length}`;
    }

    query += ` ORDER BY s.issued_at DESC`;

    const result = await pool.query(query, params);

    res.json({
      success: true,
      strikes: result.rows
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/strikes/user/:userId
 * Get strikes for a specific user
 */
router.get('/user/:userId', async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { facilityId, activeOnly, windowDays } = req.query;

    let query = `
      SELECT s.*, b.booking_date, b.start_time, c.name as court_name
      FROM account_strikes s
      LEFT JOIN bookings b ON s.related_booking_id = b.id
      LEFT JOIN courts c ON b.court_id = c.id
      WHERE s.user_id = $1
    `;
    const params: any[] = [userId];

    if (facilityId) {
      params.push(facilityId);
      query += ` AND s.facility_id = $${params.length}`;
    }

    if (activeOnly === 'true') {
      query += ` AND s.revoked = false AND (s.expires_at IS NULL OR s.expires_at > CURRENT_TIMESTAMP)`;
    }

    if (windowDays) {
      params.push(parseInt(windowDays as string));
      query += ` AND s.issued_at > CURRENT_TIMESTAMP - INTERVAL '1 day' * $${params.length}`;
    }

    query += ` ORDER BY s.issued_at DESC`;

    const result = await pool.query(query, params);

    // Calculate summary
    const activeStrikes = result.rows.filter(s =>
      !s.revoked && (!s.expires_at || new Date(s.expires_at) > new Date())
    );

    res.json({
      success: true,
      strikes: result.rows,
      summary: {
        total: result.rows.length,
        active: activeStrikes.length,
        noShows: result.rows.filter(s => s.strike_type === 'no_show').length,
        lateCancellations: result.rows.filter(s => s.strike_type === 'late_cancel').length
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/strikes/:strikeId
 * Get a specific strike
 */
router.get('/:strikeId', async (req, res, next) => {
  try {
    const { strikeId } = req.params;

    const result = await pool.query(
      `SELECT s.*, u.first_name, u.last_name, u.email,
              b.booking_date, b.start_time, c.name as court_name
       FROM account_strikes s
       LEFT JOIN users u ON s.user_id = u.id
       LEFT JOIN bookings b ON s.related_booking_id = b.id
       LEFT JOIN courts c ON b.court_id = c.id
       WHERE s.id = $1`,
      [strikeId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Strike not found'
      });
    }

    res.json({
      success: true,
      strike: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/strikes
 * Issue a new strike manually
 */
router.post('/', async (req, res, next) => {
  try {
    const {
      userId,
      facilityId,
      strikeType,
      strikeReason,
      relatedBookingId,
      relatedRuleId,
      issuedBy,
      expiresAt
    } = req.body;

    if (!userId || !facilityId || !strikeType) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: userId, facilityId, strikeType'
      });
    }

    if (!['no_show', 'late_cancel', 'manual'].includes(strikeType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid strike type. Must be: no_show, late_cancel, or manual'
      });
    }

    const result = await pool.query(
      `INSERT INTO account_strikes (
        user_id, facility_id, strike_type, strike_reason,
        related_booking_id, related_rule_id, issued_by, expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [
        userId, facilityId, strikeType, strikeReason,
        relatedBookingId, relatedRuleId, issuedBy, expiresAt
      ]
    );

    // Fire-and-forget: send email + in-app notification
    (async () => {
      try {
        const userResult = await pool.query(
          'SELECT email, full_name as "fullName" FROM users WHERE id = $1',
          [userId]
        );
        const user = userResult.rows[0];
        if (!user) return;

        const facilityResult = await pool.query(
          'SELECT name FROM facilities WHERE id = $1',
          [facilityId]
        );
        const facilityName = facilityResult.rows[0]?.name || 'your facility';

        await sendStrikeIssuedEmail(user.email, user.fullName, strikeType, strikeReason || '', facilityName, expiresAt);
        await notificationService.notifyStrikeIssued(userId, facilityName, strikeType, strikeReason || 'Strike issued by administrator');

        // Check lockout threshold
        const configResult = await pool.query(
          `SELECT rule_config FROM facility_rule_configs frc
           JOIN booking_rule_definitions brd ON frc.rule_definition_id = brd.id
           WHERE frc.facility_id = $1 AND brd.rule_code = 'ACC-009' AND frc.is_enabled = true`,
          [facilityId]
        );
        const config = configResult.rows[0]?.rule_config || { strike_threshold: 3, strike_window_days: 30, lockout_days: 7 };
        const threshold = config.strike_threshold || 3;
        const windowDays = config.strike_window_days || 30;
        const lockoutDays = config.lockout_days || 7;

        const activeResult = await pool.query(
          `SELECT COUNT(*) as count FROM account_strikes
           WHERE user_id = $1 AND facility_id = $2
             AND revoked = false
             AND issued_at > CURRENT_TIMESTAMP - INTERVAL '1 day' * $3`,
          [userId, facilityId, windowDays]
        );

        if (parseInt(activeResult.rows[0].count) >= threshold) {
          const lockoutEndsAt = new Date(Date.now() + lockoutDays * 24 * 60 * 60 * 1000).toISOString();
          await sendLockoutEmail(user.email, user.fullName, facilityName, lockoutEndsAt);
          await notificationService.notifyAccountLockedOut(userId, facilityName, lockoutEndsAt);
        }
      } catch (err) {
        console.error('Failed to send strike notifications:', err);
      }
    })();

    res.status(201).json({
      success: true,
      strike: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/strikes/:strikeId/revoke
 * Revoke a strike
 */
router.post('/:strikeId/revoke', async (req, res, next) => {
  try {
    const { strikeId } = req.params;
    const { revokedBy, revokeReason } = req.body;

    if (!revokedBy) {
      return res.status(400).json({
        success: false,
        error: 'revokedBy is required'
      });
    }

    const result = await pool.query(
      `UPDATE account_strikes SET
        revoked = true,
        revoked_at = CURRENT_TIMESTAMP,
        revoked_by = $1,
        revoke_reason = $2
      WHERE id = $3
      RETURNING *`,
      [revokedBy, revokeReason, strikeId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Strike not found'
      });
    }

    const strike = result.rows[0];

    // Fire-and-forget: send revocation email + in-app notification
    (async () => {
      try {
        const userResult = await pool.query(
          'SELECT email, full_name as "fullName" FROM users WHERE id = $1',
          [strike.user_id]
        );
        const user = userResult.rows[0];
        if (!user) return;

        const facilityResult = await pool.query(
          'SELECT name FROM facilities WHERE id = $1',
          [strike.facility_id]
        );
        const facilityName = facilityResult.rows[0]?.name || 'your facility';

        await sendStrikeRevokedEmail(user.email, user.fullName, facilityName, revokeReason);
        await notificationService.notifyStrikeRevoked(strike.user_id, facilityName, revokeReason);
      } catch (err) {
        console.error('Failed to send strike revocation notifications:', err);
      }
    })();

    res.json({
      success: true,
      strike
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/strikes/:strikeId
 * Delete a strike permanently (admin only)
 */
router.delete('/:strikeId', async (req, res, next) => {
  try {
    const { strikeId } = req.params;

    const result = await pool.query(
      `DELETE FROM account_strikes WHERE id = $1 RETURNING id`,
      [strikeId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Strike not found'
      });
    }

    res.json({
      success: true,
      message: 'Strike deleted'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/strikes/check/:userId
 * Check if user is locked out due to strikes
 */
router.get('/check/:userId', async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { facilityId } = req.query;

    if (!facilityId) {
      return res.status(400).json({
        success: false,
        error: 'facilityId query parameter is required'
      });
    }

    // Get facility's strike threshold config
    const configResult = await pool.query(
      `SELECT rule_config FROM facility_rule_configs frc
       JOIN booking_rule_definitions brd ON frc.rule_definition_id = brd.id
       WHERE frc.facility_id = $1 AND brd.rule_code = 'ACC-009' AND frc.is_enabled = true`,
      [facilityId]
    );

    const config = configResult.rows[0]?.rule_config || {
      strike_threshold: 3,
      strike_window_days: 30,
      lockout_days: 7
    };

    const threshold = config.strike_threshold || 3;
    const windowDays = config.strike_window_days || 30;
    const lockoutDays = config.lockout_days || 7;

    // Count active strikes in window
    const strikesResult = await pool.query(
      `SELECT * FROM account_strikes
       WHERE user_id = $1 AND facility_id = $2
         AND revoked = false
         AND issued_at > CURRENT_TIMESTAMP - INTERVAL '1 day' * $3
       ORDER BY issued_at DESC`,
      [userId, facilityId, windowDays]
    );

    const activeStrikes = strikesResult.rows;
    const isLockedOut = activeStrikes.length >= threshold;

    let lockoutEndsAt = null;
    if (isLockedOut && activeStrikes.length > 0) {
      const mostRecent = new Date(activeStrikes[0].issued_at);
      lockoutEndsAt = new Date(mostRecent.getTime() + lockoutDays * 24 * 60 * 60 * 1000);
    }

    res.json({
      success: true,
      isLockedOut,
      activeStrikes: activeStrikes.length,
      threshold,
      lockoutEndsAt: lockoutEndsAt?.toISOString(),
      strikes: activeStrikes
    });
  } catch (error) {
    next(error);
  }
});

export default router;
