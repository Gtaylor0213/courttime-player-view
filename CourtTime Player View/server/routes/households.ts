/**
 * Household Management Routes
 * Manage household groups and members for booking limit enforcement
 */

import express from 'express';
import { pool } from '../../src/database/connection';

const router = express.Router();

/**
 * GET /api/households/facility/:facilityId
 * Get all households for a facility
 */
router.get('/facility/:facilityId', async (req, res, next) => {
  try {
    const { facilityId } = req.params;

    const result = await pool.query(
      `SELECT hg.*,
              (SELECT COUNT(*) FROM household_members hm WHERE hm.household_id = hg.id) as member_count
       FROM household_groups hg
       WHERE hg.facility_id = $1
       ORDER BY hg.street_address ASC`,
      [facilityId]
    );

    res.json({
      success: true,
      households: result.rows
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/households/:householdId
 * Get a specific household with members
 */
router.get('/:householdId', async (req, res, next) => {
  try {
    const { householdId } = req.params;

    const householdResult = await pool.query(
      `SELECT * FROM household_groups WHERE id = $1`,
      [householdId]
    );

    if (householdResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Household not found'
      });
    }

    const membersResult = await pool.query(
      `SELECT hm.*, u.first_name, u.last_name, u.email
       FROM household_members hm
       JOIN users u ON hm.user_id = u.id
       WHERE hm.household_id = $1
       ORDER BY hm.is_primary DESC, hm.added_at ASC`,
      [householdId]
    );

    res.json({
      success: true,
      household: householdResult.rows[0],
      members: membersResult.rows
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/households/user/:userId
 * Get household for a user at a facility
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
      `SELECT hg.*, hm.is_primary, hm.verification_status
       FROM household_members hm
       JOIN household_groups hg ON hm.household_id = hg.id
       WHERE hm.user_id = $1 AND hg.facility_id = $2`,
      [userId, facilityId]
    );

    if (result.rows.length === 0) {
      return res.json({
        success: true,
        household: null,
        message: 'User is not associated with any household'
      });
    }

    // Get all members of the household
    const membersResult = await pool.query(
      `SELECT hm.*, u.first_name, u.last_name, u.email
       FROM household_members hm
       JOIN users u ON hm.user_id = u.id
       WHERE hm.household_id = $1`,
      [result.rows[0].id]
    );

    res.json({
      success: true,
      household: result.rows[0],
      members: membersResult.rows
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/households
 * Create a new household
 */
router.post('/', async (req, res, next) => {
  try {
    const {
      facilityId,
      hoaAddressId,
      streetAddress,
      city,
      state,
      zipCode,
      maxMembers,
      maxActiveReservations,
      primeTimeMaxPerWeek,
      householdName
    } = req.body;

    if (!facilityId || !streetAddress) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: facilityId, streetAddress'
      });
    }

    // Check if household already exists for this address
    const existing = await pool.query(
      `SELECT id FROM household_groups
       WHERE facility_id = $1 AND LOWER(street_address) = LOWER($2)`,
      [facilityId, streetAddress]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'A household already exists for this address',
        existingHouseholdId: existing.rows[0].id
      });
    }

    const result = await pool.query(
      `INSERT INTO household_groups (
        facility_id, hoa_address_id, street_address, city, state, zip_code,
        max_members, max_active_reservations, prime_time_max_per_week, household_name
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *`,
      [
        facilityId, hoaAddressId, streetAddress, city, state, zipCode,
        maxMembers || 6, maxActiveReservations, primeTimeMaxPerWeek, householdName
      ]
    );

    res.status(201).json({
      success: true,
      household: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/households/:householdId
 * Update a household
 */
router.put('/:householdId', async (req, res, next) => {
  try {
    const { householdId } = req.params;
    const {
      maxMembers,
      maxActiveReservations,
      primeTimeMaxPerWeek,
      householdName
    } = req.body;

    const result = await pool.query(
      `UPDATE household_groups SET
        max_members = COALESCE($1, max_members),
        max_active_reservations = COALESCE($2, max_active_reservations),
        prime_time_max_per_week = COALESCE($3, prime_time_max_per_week),
        household_name = COALESCE($4, household_name),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $5
      RETURNING *`,
      [maxMembers, maxActiveReservations, primeTimeMaxPerWeek, householdName, householdId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Household not found'
      });
    }

    res.json({
      success: true,
      household: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/households/:householdId
 * Delete a household (only if no members)
 */
router.delete('/:householdId', async (req, res, next) => {
  try {
    const { householdId } = req.params;
    const { force } = req.query;

    // Check for members
    const membersResult = await pool.query(
      `SELECT COUNT(*) FROM household_members WHERE household_id = $1`,
      [householdId]
    );

    if (parseInt(membersResult.rows[0].count) > 0 && force !== 'true') {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete household with members. Remove members first or use force=true.'
      });
    }

    // Delete members first if force
    if (force === 'true') {
      await pool.query(
        `DELETE FROM household_members WHERE household_id = $1`,
        [householdId]
      );
    }

    await pool.query(
      `DELETE FROM household_groups WHERE id = $1`,
      [householdId]
    );

    res.json({
      success: true,
      message: 'Household deleted'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/households/:householdId/members
 * Add a member to a household
 */
router.post('/:householdId/members', async (req, res, next) => {
  try {
    const { householdId } = req.params;
    const { userId, isPrimary, verificationStatus } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required'
      });
    }

    // Get household to check max members and facility
    const householdResult = await pool.query(
      `SELECT * FROM household_groups WHERE id = $1`,
      [householdId]
    );

    if (householdResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Household not found'
      });
    }

    const household = householdResult.rows[0];

    // Check if user is already in a household for this facility
    const existingResult = await pool.query(
      `SELECT hm.*, hg.street_address
       FROM household_members hm
       JOIN household_groups hg ON hm.household_id = hg.id
       WHERE hm.user_id = $1 AND hg.facility_id = $2`,
      [userId, household.facility_id]
    );

    if (existingResult.rows.length > 0) {
      return res.status(400).json({
        success: false,
        error: `User is already a member of a household at ${existingResult.rows[0].street_address}`
      });
    }

    // Check max members
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM household_members WHERE household_id = $1`,
      [householdId]
    );

    const currentCount = parseInt(countResult.rows[0].count);
    if (currentCount >= (household.max_members || 6)) {
      return res.status(400).json({
        success: false,
        error: `Household has reached maximum of ${household.max_members || 6} members`
      });
    }

    // If setting as primary, unset other primaries
    if (isPrimary) {
      await pool.query(
        `UPDATE household_members SET is_primary = false WHERE household_id = $1`,
        [householdId]
      );
    }

    const result = await pool.query(
      `INSERT INTO household_members (household_id, user_id, is_primary, verification_status)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [householdId, userId, isPrimary || false, verificationStatus || 'pending']
    );

    res.status(201).json({
      success: true,
      member: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/households/:householdId/members/:userId
 * Update a household member
 */
router.put('/:householdId/members/:userId', async (req, res, next) => {
  try {
    const { householdId, userId } = req.params;
    const { isPrimary, verificationStatus } = req.body;

    // If setting as primary, unset other primaries
    if (isPrimary) {
      await pool.query(
        `UPDATE household_members SET is_primary = false WHERE household_id = $1`,
        [householdId]
      );
    }

    const result = await pool.query(
      `UPDATE household_members SET
        is_primary = COALESCE($1, is_primary),
        verification_status = COALESCE($2, verification_status)
      WHERE household_id = $3 AND user_id = $4
      RETURNING *`,
      [isPrimary, verificationStatus, householdId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Household member not found'
      });
    }

    res.json({
      success: true,
      member: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/households/:householdId/members/:userId
 * Remove a member from a household
 */
router.delete('/:householdId/members/:userId', async (req, res, next) => {
  try {
    const { householdId, userId } = req.params;

    const result = await pool.query(
      `DELETE FROM household_members
       WHERE household_id = $1 AND user_id = $2
       RETURNING id`,
      [householdId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Household member not found'
      });
    }

    res.json({
      success: true,
      message: 'Member removed from household'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/households/:householdId/bookings
 * Get all active bookings for a household
 */
router.get('/:householdId/bookings', async (req, res, next) => {
  try {
    const { householdId } = req.params;
    const { includePast } = req.query;

    let query = `
      SELECT b.*, u.first_name, u.last_name, c.name as court_name
      FROM bookings b
      JOIN users u ON b.user_id = u.id
      JOIN courts c ON b.court_id = c.id
      JOIN household_members hm ON b.user_id = hm.user_id
      WHERE hm.household_id = $1 AND b.status != 'cancelled'
    `;

    if (includePast !== 'true') {
      query += ` AND b.booking_date >= CURRENT_DATE`;
    }

    query += ` ORDER BY b.booking_date ASC, b.start_time ASC`;

    const result = await pool.query(query, [householdId]);

    // Calculate summary
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const activeBookings = result.rows.filter(b => b.booking_date >= today);
    const primeTimeBookings = result.rows.filter(b => b.is_prime_time);

    res.json({
      success: true,
      bookings: result.rows,
      summary: {
        total: result.rows.length,
        active: activeBookings.length,
        primeTime: primeTimeBookings.length
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/households/auto-create
 * Auto-create households from HOA addresses
 */
router.post('/auto-create', async (req, res, next) => {
  try {
    const { facilityId } = req.body;

    if (!facilityId) {
      return res.status(400).json({
        success: false,
        error: 'facilityId is required'
      });
    }

    // Get HOA addresses not already linked to households
    const addressesResult = await pool.query(
      `SELECT ha.*
       FROM hoa_addresses ha
       WHERE ha.facility_id = $1
         AND NOT EXISTS (
           SELECT 1 FROM household_groups hg
           WHERE hg.hoa_address_id = ha.id
         )`,
      [facilityId]
    );

    const client = await pool.connect();
    const created: any[] = [];

    try {
      await client.query('BEGIN');

      for (const addr of addressesResult.rows) {
        const result = await client.query(
          `INSERT INTO household_groups (
            facility_id, hoa_address_id, street_address, city, state, zip_code
          ) VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING *`,
          [
            facilityId,
            addr.id,
            addr.street_address,
            addr.city,
            addr.state,
            addr.zip_code
          ]
        );
        created.push(result.rows[0]);
      }

      await client.query('COMMIT');

      res.json({
        success: true,
        created: created.length,
        households: created
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

export default router;
