/**
 * Membership Tier Routes
 * Manage membership tiers and user tier assignments
 */

import express from 'express';
import { pool } from '../../src/database/connection';

const router = express.Router();

/**
 * GET /api/tiers/facility/:facilityId
 * Get all tiers for a facility
 */
router.get('/facility/:facilityId', async (req, res, next) => {
  try {
    const { facilityId } = req.params;

    const result = await pool.query(
      `SELECT * FROM membership_tiers
       WHERE facility_id = $1
       ORDER BY tier_level ASC`,
      [facilityId]
    );

    res.json({
      success: true,
      tiers: result.rows
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/tiers/:tierId
 * Get a specific tier
 */
router.get('/:tierId', async (req, res, next) => {
  try {
    const { tierId } = req.params;

    const result = await pool.query(
      `SELECT * FROM membership_tiers WHERE id = $1`,
      [tierId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Tier not found'
      });
    }

    res.json({
      success: true,
      tier: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/tiers
 * Create a new tier
 */
router.post('/', async (req, res, next) => {
  try {
    const {
      facilityId,
      tierName,
      tierLevel,
      advanceBookingDays,
      primeTimeEligible,
      primeTimeMaxPerWeek,
      maxActiveReservations,
      maxReservationsPerWeek,
      maxMinutesPerWeek,
      isDefault
    } = req.body;

    if (!facilityId || !tierName || tierLevel === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: facilityId, tierName, tierLevel'
      });
    }

    // If this is default, unset other defaults
    if (isDefault) {
      await pool.query(
        `UPDATE membership_tiers SET is_default = false WHERE facility_id = $1`,
        [facilityId]
      );
    }

    const result = await pool.query(
      `INSERT INTO membership_tiers (
        facility_id, tier_name, tier_level,
        advance_booking_days, prime_time_eligible, prime_time_max_per_week,
        max_active_reservations, max_reservations_per_week, max_minutes_per_week,
        is_default
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *`,
      [
        facilityId, tierName, tierLevel,
        advanceBookingDays || 7, primeTimeEligible !== false, primeTimeMaxPerWeek,
        maxActiveReservations, maxReservationsPerWeek, maxMinutesPerWeek,
        isDefault || false
      ]
    );

    res.status(201).json({
      success: true,
      tier: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/tiers/:tierId
 * Update a tier
 */
router.put('/:tierId', async (req, res, next) => {
  try {
    const { tierId } = req.params;
    const {
      tierName,
      tierLevel,
      advanceBookingDays,
      primeTimeEligible,
      primeTimeMaxPerWeek,
      maxActiveReservations,
      maxReservationsPerWeek,
      maxMinutesPerWeek,
      isDefault
    } = req.body;

    // Get current tier to check facility
    const current = await pool.query(
      `SELECT facility_id FROM membership_tiers WHERE id = $1`,
      [tierId]
    );

    if (current.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Tier not found'
      });
    }

    // If setting as default, unset others
    if (isDefault) {
      await pool.query(
        `UPDATE membership_tiers SET is_default = false WHERE facility_id = $1`,
        [current.rows[0].facility_id]
      );
    }

    const result = await pool.query(
      `UPDATE membership_tiers SET
        tier_name = COALESCE($1, tier_name),
        tier_level = COALESCE($2, tier_level),
        advance_booking_days = COALESCE($3, advance_booking_days),
        prime_time_eligible = COALESCE($4, prime_time_eligible),
        prime_time_max_per_week = COALESCE($5, prime_time_max_per_week),
        max_active_reservations = COALESCE($6, max_active_reservations),
        max_reservations_per_week = COALESCE($7, max_reservations_per_week),
        max_minutes_per_week = COALESCE($8, max_minutes_per_week),
        is_default = COALESCE($9, is_default),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $10
      RETURNING *`,
      [
        tierName, tierLevel, advanceBookingDays,
        primeTimeEligible, primeTimeMaxPerWeek,
        maxActiveReservations, maxReservationsPerWeek, maxMinutesPerWeek,
        isDefault, tierId
      ]
    );

    res.json({
      success: true,
      tier: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/tiers/:tierId
 * Delete a tier (only if no users assigned)
 */
router.delete('/:tierId', async (req, res, next) => {
  try {
    const { tierId } = req.params;

    // Check for assigned users
    const assigned = await pool.query(
      `SELECT COUNT(*) FROM user_tiers WHERE tier_id = $1`,
      [tierId]
    );

    if (parseInt(assigned.rows[0].count) > 0) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete tier with assigned users. Reassign users first.'
      });
    }

    await pool.query(`DELETE FROM membership_tiers WHERE id = $1`, [tierId]);

    res.json({
      success: true,
      message: 'Tier deleted'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/tiers/user/:userId
 * Get user's tier for a facility
 */
router.get('/user/:userId', async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { facilityId } = req.query;

    if (!facilityId) {
      return res.status(400).json({
        success: false,
        error: 'facilityId query parameter is required'
      });
    }

    const result = await pool.query(
      `SELECT ut.*, mt.tier_name, mt.tier_level, mt.advance_booking_days,
              mt.prime_time_eligible, mt.prime_time_max_per_week,
              mt.max_active_reservations, mt.max_reservations_per_week,
              mt.max_minutes_per_week
       FROM user_tiers ut
       JOIN membership_tiers mt ON ut.tier_id = mt.id
       WHERE ut.user_id = $1 AND ut.facility_id = $2
         AND (ut.expires_at IS NULL OR ut.expires_at > CURRENT_TIMESTAMP)`,
      [userId, facilityId]
    );

    if (result.rows.length === 0) {
      // Return default tier
      const defaultTier = await pool.query(
        `SELECT * FROM membership_tiers WHERE facility_id = $1 AND is_default = true`,
        [facilityId]
      );

      if (defaultTier.rows.length > 0) {
        return res.json({
          success: true,
          userTier: null,
          effectiveTier: defaultTier.rows[0],
          isDefault: true
        });
      }

      return res.json({
        success: true,
        userTier: null,
        effectiveTier: null,
        isDefault: false
      });
    }

    res.json({
      success: true,
      userTier: result.rows[0],
      effectiveTier: result.rows[0],
      isDefault: false
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/tiers/:tierId/assign
 * Assign a user to a tier
 */
router.post('/:tierId/assign', async (req, res, next) => {
  try {
    const { tierId } = req.params;
    const { userId, facilityId, assignedBy, expiresAt } = req.body;

    if (!userId || !facilityId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: userId, facilityId'
      });
    }

    // Check if user already has a tier assignment
    const existing = await pool.query(
      `SELECT id FROM user_tiers WHERE user_id = $1 AND facility_id = $2`,
      [userId, facilityId]
    );

    let result;
    if (existing.rows.length > 0) {
      // Update existing
      result = await pool.query(
        `UPDATE user_tiers SET
          tier_id = $1,
          assigned_by = $2,
          assigned_at = CURRENT_TIMESTAMP,
          expires_at = $3
        WHERE user_id = $4 AND facility_id = $5
        RETURNING *`,
        [tierId, assignedBy, expiresAt, userId, facilityId]
      );
    } else {
      // Insert new
      result = await pool.query(
        `INSERT INTO user_tiers (user_id, facility_id, tier_id, assigned_by, expires_at)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [userId, facilityId, tierId, assignedBy, expiresAt]
      );
    }

    res.json({
      success: true,
      userTier: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/tiers/user/:userId/unassign
 * Remove user's tier assignment (falls back to default)
 */
router.delete('/user/:userId/unassign', async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { facilityId } = req.query;

    if (!facilityId) {
      return res.status(400).json({
        success: false,
        error: 'facilityId query parameter is required'
      });
    }

    await pool.query(
      `DELETE FROM user_tiers WHERE user_id = $1 AND facility_id = $2`,
      [userId, facilityId]
    );

    res.json({
      success: true,
      message: 'User tier assignment removed'
    });
  } catch (error) {
    next(error);
  }
});

export default router;
