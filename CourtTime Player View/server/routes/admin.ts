/**
 * Admin API Routes
 * Handles admin-specific operations for facility management
 */

import express from 'express';
import { query } from '../../src/database/connection';
import { validateBooking } from '../../src/services/bookingService';
import { sendAnnouncementEmail } from '../../src/services/emailService';
import { notificationService } from '../../src/services/notificationService';
import { EMAIL_TEMPLATE_TYPES, renderTemplate, wrapInEmailLayout, getSampleVariables } from '../../src/services/emailTemplateDefaults';
import { createCourt, createCourtsBulk, updateCourtsBulk } from '../../src/services/courtService';
import { inviteAdmin, getFacilityAdmins, removeAdmin } from '../../src/services/adminService';
import {
  getCurrentTermsVersion,
  getTermsAcceptanceSummaryForFacility,
  getTermsVersionHistory,
  publishTermsVersion
} from '../../src/services/termsService';

const router = express.Router();

/**
 * GET /api/admin/dashboard/:facilityId
 * Get dashboard statistics for a facility
 */
router.get('/dashboard/:facilityId', async (req, res) => {
  try {
    const { facilityId } = req.params;

    // Get total bookings for this month
    const bookingsResult = await query(`
      SELECT COUNT(*) as total_bookings
      FROM bookings
      WHERE facility_id = $1
        AND booking_date >= DATE_TRUNC('month', CURRENT_DATE)
        AND booking_date < DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month'
        AND status != 'cancelled'
    `, [facilityId]);

    // Get bookings from last month for comparison
    const lastMonthBookingsResult = await query(`
      SELECT COUNT(*) as total_bookings
      FROM bookings
      WHERE facility_id = $1
        AND booking_date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month'
        AND booking_date < DATE_TRUNC('month', CURRENT_DATE)
        AND status != 'cancelled'
    `, [facilityId]);

    // Get active members count
    const membersResult = await query(`
      SELECT COUNT(*) as active_members
      FROM facility_memberships
      WHERE facility_id = $1
        AND status = 'active'
    `, [facilityId]);

    // Get members from last month for comparison
    const lastMonthMembersResult = await query(`
      SELECT COUNT(*) as active_members
      FROM facility_memberships
      WHERE facility_id = $1
        AND status = 'active'
        AND start_date < DATE_TRUNC('month', CURRENT_DATE)
    `, [facilityId]);

    // Get court utilization (bookings vs available slots)
    const utilizationResult = await query(`
      SELECT
        COUNT(DISTINCT c.id) as total_courts,
        COUNT(b.id) as total_bookings
      FROM courts c
      LEFT JOIN bookings b ON c.id = b.court_id
        AND b.booking_date >= DATE_TRUNC('month', CURRENT_DATE)
        AND b.booking_date < DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month'
        AND b.status != 'cancelled'
      WHERE c.facility_id = $1
        AND c.status = 'active'
    `, [facilityId]);

    // Get recent activity (last 10 bookings)
    const recentActivityResult = await query(`
      SELECT
        b.id,
        b.booking_date as "bookingDate",
        b.start_time as "startTime",
        b.end_time as "endTime",
        u.full_name as "userName",
        c.name as "courtName",
        b.status,
        b.created_at as "createdAt"
      FROM bookings b
      JOIN users u ON b.user_id = u.id
      JOIN courts c ON b.court_id = c.id
      WHERE b.facility_id = $1
      ORDER BY b.created_at DESC
      LIMIT 10
    `, [facilityId]);

    const totalBookings = parseInt(bookingsResult.rows[0]?.total_bookings || 0);
    const lastMonthBookings = parseInt(lastMonthBookingsResult.rows[0]?.total_bookings || 0);
    const bookingsChange = lastMonthBookings > 0
      ? Math.round(((totalBookings - lastMonthBookings) / lastMonthBookings) * 100)
      : 0;

    const activeMembers = parseInt(membersResult.rows[0]?.active_members || 0);
    const lastMonthMembers = parseInt(lastMonthMembersResult.rows[0]?.active_members || 0);
    const newMembers = Math.max(0, activeMembers - lastMonthMembers);

    const totalCourts = parseInt(utilizationResult.rows[0]?.total_courts || 1);
    const totalSlots = totalCourts * 30 * 12; // Approximate: courts * days * hours per day
    const bookedSlots = parseInt(utilizationResult.rows[0]?.total_bookings || 0);
    const utilization = Math.round((bookedSlots / totalSlots) * 100);

    res.json({
      success: true,
      data: {
        stats: {
          totalBookings,
          bookingsChange,
          activeMembers,
          newMembers,
          courtUtilization: utilization,
          revenue: 0 // Placeholder - would need pricing data
        },
        recentActivity: recentActivityResult.rows
      }
    });
  } catch (error: any) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PATCH /api/admin/facilities/:facilityId
 * Update facility information
 */
router.patch('/facilities/:facilityId', async (req, res) => {
  try {
    const { facilityId } = req.params;
    const {
      name,
      type,
      address,
      streetAddress,
      city,
      state,
      zipCode,
      phone,
      email,
      description,
      operatingHours,
      timezone,
      logoUrl,
      primaryContact,
      secondaryContacts,
      bookingRules
    } = req.body;

    // Extract generalRules from bookingRules if provided
    const generalRules = bookingRules?.generalRules ?? null;
    const serializedBookingRules = bookingRules ? JSON.stringify(bookingRules) : null;

    const result = await query(`
      UPDATE facilities
      SET
        name = COALESCE($1, name),
        type = COALESCE($2, type),
        address = COALESCE($3, address),
        phone = COALESCE($4, phone),
        email = COALESCE($5, email),
        description = COALESCE($6, description),
        operating_hours = COALESCE($7, operating_hours),
        street_address = COALESCE($8, street_address),
        city = COALESCE($9, city),
        state = COALESCE($10, state),
        zip_code = COALESCE($11, zip_code),
        logo_url = COALESCE($12, logo_url),
        timezone = COALESCE($13, timezone),
        general_rules = COALESCE($14, general_rules),
        booking_rules = COALESCE($15, booking_rules),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $16
      RETURNING
        id,
        name,
        type,
        address,
        street_address as "streetAddress",
        city,
        state,
        zip_code as "zipCode",
        phone,
        email,
        description,
        operating_hours as "operatingHours",
        timezone,
        logo_url as "logoUrl",
        general_rules as "generalRules",
        created_at as "createdAt",
        updated_at as "updatedAt"
    `, [name, type, address, phone, email, description, operatingHours, streetAddress, city, state, zipCode, logoUrl, timezone, generalRules, serializedBookingRules, facilityId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Facility not found'
      });
    }

    // Save contacts to facility_contacts table
    if (primaryContact) {
      try {
        const existing = await query(
          `SELECT id FROM facility_contacts WHERE facility_id = $1 AND is_primary = true LIMIT 1`,
          [facilityId]
        );
        if (existing.rows.length > 0) {
          await query(
            `UPDATE facility_contacts SET name = $1, email = $2, phone = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4`,
            [primaryContact.name, primaryContact.email, primaryContact.phone, existing.rows[0].id]
          );
        } else {
          await query(
            `INSERT INTO facility_contacts (facility_id, name, email, phone, is_primary, role, is_active) VALUES ($1, $2, $3, $4, true, 'Primary Contact', true)`,
            [facilityId, primaryContact.name, primaryContact.email, primaryContact.phone]
          );
        }
      } catch (contactErr) {
        console.error('Error saving primary contact:', contactErr);
      }
    }

    if (secondaryContacts && Array.isArray(secondaryContacts)) {
      try {
        // Remove old secondary contacts and replace
        await query(`DELETE FROM facility_contacts WHERE facility_id = $1 AND is_primary = false`, [facilityId]);
        for (const contact of secondaryContacts) {
          if (contact.name || contact.email || contact.phone) {
            await query(
              `INSERT INTO facility_contacts (facility_id, name, email, phone, is_primary, is_active) VALUES ($1, $2, $3, $4, false, true)`,
              [facilityId, contact.name, contact.email, contact.phone]
            );
          }
        }
      } catch (secErr) {
        console.error('Error saving secondary contacts:', secErr);
      }
    }

    // Save booking rules to facility_rules table (legacy storage for restriction type, peak hours, weekend policy)
    if (bookingRules) {
      try {
        // Upsert restriction type only (new simplified rules use facilities.booking_rules JSON)
        const bookingLimitConfig = JSON.stringify({
          restriction_type: bookingRules.restrictionType || 'account',
        });

        const existingLimit = await query(
          `SELECT id FROM facility_rules WHERE facility_id = $1 AND rule_type = 'booking_limit' LIMIT 1`,
          [facilityId]
        );
        if (existingLimit.rows.length > 0) {
          await query(`UPDATE facility_rules SET rule_config = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
            [bookingLimitConfig, existingLimit.rows[0].id]);
        } else {
          await query(
            `INSERT INTO facility_rules (facility_id, rule_type, rule_name, rule_description, rule_config)
             VALUES ($1, 'booking_limit', 'Default Booking Limits', 'Default booking limits', $2)`,
            [facilityId, bookingLimitConfig]
          );
        }

        // Remove legacy policy rows from this section
        await query(`DELETE FROM facility_rules WHERE facility_id = $1 AND rule_type IN ('peak_hours', 'weekend_policy')`, [facilityId]);
      } catch (rulesErr) {
        console.error('Error saving facility rules:', rulesErr);
      }
    }

    res.json({
      success: true,
      data: {
        facility: result.rows[0]
      }
    });
  } catch (error: any) {
    console.error('Error updating facility:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PATCH /api/admin/courts/bulk-update
 * Bulk update multiple courts with shared property changes
 * NOTE: Must be defined BEFORE /courts/:courtId to avoid matching 'bulk-update' as courtId
 */
router.patch('/courts/bulk-update', async (req, res) => {
  try {
    const { courtIds, updates } = req.body;

    if (!Array.isArray(courtIds) || courtIds.length === 0) {
      return res.status(400).json({ success: false, error: 'courtIds must be a non-empty array' });
    }

    if (!updates || typeof updates !== 'object') {
      return res.status(400).json({ success: false, error: 'updates object is required' });
    }

    const updatedCount = await updateCourtsBulk(courtIds, updates);

    res.json({
      success: true,
      data: { updatedCount },
      message: `${updatedCount} courts updated`,
    });
  } catch (error: any) {
    console.error('Error bulk updating courts:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PATCH /api/admin/courts/:courtId
 * Update court information
 */
router.patch('/courts/:courtId', async (req, res) => {
  try {
    const { courtId } = req.params;
    const {
      name,
      courtNumber,
      surfaceType,
      courtType,
      isIndoor,
      hasLights,
      isWalkUp,
      status: rawStatus
    } = req.body;

    // Normalize legacy status values to match DB constraint
    const statusMap: Record<string, string> = { active: 'available', inactive: 'closed' };
    const status = rawStatus ? (statusMap[rawStatus] || rawStatus) : rawStatus;

    const result = await query(`
      UPDATE courts
      SET
        name = COALESCE($1, name),
        court_number = COALESCE($2, court_number),
        surface_type = COALESCE($3, surface_type),
        court_type = COALESCE($4, court_type),
        is_indoor = COALESCE($5, is_indoor),
        has_lights = COALESCE($6, has_lights),
        is_walk_up = COALESCE($7, is_walk_up),
        status = COALESCE($8, status),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $9
      RETURNING
        id,
        facility_id as "facilityId",
        name,
        court_number as "courtNumber",
        surface_type as "surfaceType",
        court_type as "courtType",
        is_indoor as "isIndoor",
        has_lights as "hasLights",
        is_walk_up as "isWalkUp",
        status,
        created_at as "createdAt",
        updated_at as "updatedAt"
    `, [name, courtNumber, surfaceType, courtType, isIndoor, hasLights, isWalkUp, status, courtId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Court not found'
      });
    }

    res.json({
      success: true,
      data: {
        court: result.rows[0]
      }
    });
  } catch (error: any) {
    console.error('Error updating court:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/admin/courts/:facilityId
 * Create a single court
 */
router.post('/courts/:facilityId', async (req, res) => {
  try {
    const { facilityId } = req.params;
    const { name, courtNumber, surfaceType, courtType, isIndoor, hasLights, isWalkUp } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, error: 'Court name is required' });
    }

    const court = await createCourt({
      facilityId,
      name,
      courtNumber: courtNumber || 1,
      surfaceType: surfaceType || 'Hard',
      courtType: courtType || 'Tennis',
      isIndoor: isIndoor || false,
      hasLights: hasLights || false,
      isWalkUp: isWalkUp || false,
    });

    res.json({ success: true, data: { court } });
  } catch (error: any) {
    console.error('Error creating court:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/admin/courts/:facilityId/bulk
 * Bulk create courts with shared properties
 */
router.post('/courts/:facilityId/bulk', async (req, res) => {
  try {
    const { facilityId } = req.params;
    const { count, startingNumber, surfaceType, courtType, isIndoor, hasLights, isWalkUp } = req.body;

    const courtCount = parseInt(count);
    if (isNaN(courtCount) || courtCount < 1 || courtCount > 50) {
      return res.status(400).json({ success: false, error: 'Count must be between 1 and 50' });
    }

    const courts = await createCourtsBulk(
      {
        facilityId,
        surfaceType: surfaceType || 'Hard',
        courtType: courtType || 'Tennis',
        isIndoor: isIndoor || false,
        hasLights: hasLights || false,
        isWalkUp: isWalkUp || false,
      },
      courtCount,
      parseInt(startingNumber) || 1
    );

    res.json({
      success: true,
      data: { courts },
      message: `${courts.length} courts created`,
    });
  } catch (error: any) {
    console.error('Error bulk creating courts:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/admin/bookings/:facilityId
 * Get all bookings for a facility with filters
 */
router.get('/bookings/:facilityId', async (req, res) => {
  try {
    const { facilityId } = req.params;
    const { status, startDate, endDate, courtId } = req.query;

    const seedConditions: string[] = ['sb.facility_id = $1'];
    const outerConditions: string[] = ['b.facility_id = $1'];

    const params: any[] = [facilityId];
    let paramCount = 1;

    if (status && status !== 'all') {
      paramCount++;
      seedConditions.push(`sb.status = $${paramCount}`);
      outerConditions.push(`b.status = $${paramCount}`);
      params.push(status);
    }

    if (startDate) {
      paramCount++;
      seedConditions.push(`sb.booking_date >= $${paramCount}`);
      params.push(startDate);
    }

    if (endDate) {
      paramCount++;
      seedConditions.push(`sb.booking_date <= $${paramCount}`);
      params.push(endDate);
    }

    if (courtId && courtId !== 'all') {
      paramCount++;
      seedConditions.push(`sb.court_id = $${paramCount}`);
      outerConditions.push(`b.court_id = $${paramCount}`);
      params.push(courtId);
    }

    const queryText = `
      WITH seed_bookings AS (
        SELECT sb.id, sb.series_id as "seriesId"
        FROM bookings sb
        WHERE ${seedConditions.join(' AND ')}
      ),
      matched_series AS (
        SELECT DISTINCT "seriesId"
        FROM seed_bookings
        WHERE "seriesId" IS NOT NULL
      ),
      matched_singletons AS (
        SELECT id
        FROM seed_bookings
        WHERE "seriesId" IS NULL
      )
      SELECT
        b.id,
        b.series_id as "seriesId",
        (b.series_id IS NOT NULL) as "isRecurring",
        CASE
          WHEN b.series_id IS NULL THEN 1
          ELSE COUNT(*) OVER (PARTITION BY b.series_id)
        END as "seriesSize",
        b.court_id as "courtId",
        b.user_id as "userId",
        b.facility_id as "facilityId",
        b.booking_date as "bookingDate",
        b.start_time as "startTime",
        b.end_time as "endTime",
        b.duration_minutes as "durationMinutes",
        b.status,
        b.booking_type as "bookingType",
        b.notes,
        b.created_at as "createdAt",
        b.updated_at as "updatedAt",
        bs.created_by as "seriesCreatedBy",
        bs.created_at as "seriesCreatedAt",
        c.name as "courtName",
        c.court_number as "courtNumber",
        u.full_name as "userName",
        u.email as "userEmail"
      FROM bookings b
      LEFT JOIN booking_series bs ON b.series_id = bs.id
      JOIN courts c ON b.court_id = c.id
      JOIN users u ON b.user_id = u.id
      WHERE ${outerConditions.join(' AND ')}
        AND (
          (b.series_id IS NOT NULL AND b.series_id IN (SELECT "seriesId" FROM matched_series))
          OR (b.series_id IS NULL AND b.id IN (SELECT id FROM matched_singletons))
        )
      ORDER BY COALESCE(b.series_id::text, b.id::text), b.booking_date DESC, b.start_time DESC
    `;

    const result = await query(queryText, params);

    res.json({
      success: true,
      data: {
        bookings: result.rows
      }
    });
  } catch (error: any) {
    console.error('Error fetching bookings:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PATCH /api/admin/bookings/:bookingId/status
 * Update booking status (cancel, confirm, etc.)
 */
router.patch('/bookings/:bookingId/status', async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { status } = req.body;

    if (!['confirmed', 'cancelled', 'completed'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid status. Must be: confirmed, cancelled, or completed'
      });
    }

    const result = await query(`
      UPDATE bookings
      SET
        status = $1,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING
        id,
        court_id as "courtId",
        user_id as "userId",
        facility_id as "facilityId",
        booking_date as "bookingDate",
        start_time as "startTime",
        end_time as "endTime",
        status,
        updated_at as "updatedAt"
    `, [status, bookingId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Booking not found'
      });
    }

    res.json({
      success: true,
      data: {
        booking: result.rows[0]
      }
    });
  } catch (error: any) {
    console.error('Error updating booking status:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PATCH /api/admin/booking-series/:seriesId
 * Edit all bookings in a recurring series (all-or-nothing)
 */
router.patch('/booking-series/:seriesId', async (req, res) => {
  const { seriesId } = req.params;
  const { startTime, endTime, durationMinutes, bookingType, notes } = req.body;

  if (!startTime || !endTime || !durationMinutes) {
    return res.status(400).json({
      success: false,
      error: 'startTime, endTime, and durationMinutes are required'
    });
  }

  try {
    const bookingsResult = await query(
      `SELECT
         b.id,
         b.court_id as "courtId",
         b.user_id as "userId",
         b.facility_id as "facilityId",
         TO_CHAR(b.booking_date, 'YYYY-MM-DD') as "bookingDate"
       FROM bookings b
       WHERE b.series_id = $1
         AND b.status != 'cancelled'
       ORDER BY b.booking_date ASC`,
      [seriesId]
    );

    if (bookingsResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Series not found or empty' });
    }

    const validationErrors: any[] = [];
    for (const b of bookingsResult.rows) {
      const validation = await validateBooking({
        courtId: b.courtId,
        userId: b.userId,
        facilityId: b.facilityId,
        bookingDate: b.bookingDate,
        startTime,
        endTime,
        durationMinutes,
        bookingType
      });

      if (!validation.allowed) {
        validationErrors.push({
          bookingId: b.id,
          bookingDate: b.bookingDate,
          violations: validation.blockers
        });
      }

      const conflictCheck = await query(
        `SELECT id
         FROM bookings
         WHERE court_id = $1
           AND booking_date = $2
           AND status != 'cancelled'
           AND id != $3
           AND (
             (start_time <= $4 AND end_time > $4)
             OR (start_time < $5 AND end_time >= $5)
             OR (start_time >= $4 AND end_time <= $5)
           )`,
        [b.courtId, b.bookingDate, b.id, startTime, endTime]
      );

      if (conflictCheck.rows.length > 0) {
        validationErrors.push({
          bookingId: b.id,
          bookingDate: b.bookingDate,
          violations: [{ message: 'Time slot conflict with existing booking' }]
        });
      }
    }

    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Series edit failed validation; no bookings were changed.',
        validationErrors
      });
    }

    await query(
      `UPDATE bookings
       SET start_time = $1,
           end_time = $2,
           duration_minutes = $3,
           booking_type = COALESCE($4, booking_type),
           notes = $5,
           updated_at = CURRENT_TIMESTAMP
       WHERE series_id = $6
         AND status != 'cancelled'`,
      [startTime, endTime, durationMinutes, bookingType || null, notes || null, seriesId]
    );

    await query(
      `UPDATE booking_series
       SET notes = COALESCE($1, notes),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [notes || null, seriesId]
    );

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error updating booking series:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/admin/booking-series/:seriesId
 * Cancel all bookings in a recurring series
 */
router.delete('/booking-series/:seriesId', async (req, res) => {
  const { seriesId } = req.params;

  try {
    await query(`DELETE FROM bookings WHERE series_id = $1`, [seriesId]);

    await query(
      `DELETE FROM booking_series
       WHERE id = $1`,
      [seriesId]
    );

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting booking series:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PATCH /api/admin/booking-series/:seriesId/instances
 * Edit selected dates/instances in a recurring series
 */
router.patch('/booking-series/:seriesId/instances', async (req, res) => {
  const { seriesId } = req.params;
  const { bookingIds, startTime, endTime, durationMinutes, bookingType, notes } = req.body;

  if (!Array.isArray(bookingIds) || bookingIds.length === 0) {
    return res.status(400).json({ success: false, error: 'bookingIds is required' });
  }
  if (!startTime || !endTime || !durationMinutes) {
    return res.status(400).json({ success: false, error: 'startTime, endTime, and durationMinutes are required' });
  }

  try {
    const bookingsResult = await query(
      `SELECT
         b.id,
         b.court_id as "courtId",
         b.user_id as "userId",
         b.facility_id as "facilityId",
         TO_CHAR(b.booking_date, 'YYYY-MM-DD') as "bookingDate"
       FROM bookings b
       WHERE b.series_id = $1
         AND b.id = ANY($2::uuid[])
         AND b.status != 'cancelled'`,
      [seriesId, bookingIds]
    );

    if (bookingsResult.rows.length !== bookingIds.length) {
      return res.status(400).json({
        success: false,
        error: 'One or more selected bookings are missing, cancelled, or not part of this series'
      });
    }

    const validationErrors: any[] = [];
    for (const b of bookingsResult.rows) {
      const validation = await validateBooking({
        courtId: b.courtId,
        userId: b.userId,
        facilityId: b.facilityId,
        bookingDate: b.bookingDate,
        startTime,
        endTime,
        durationMinutes,
        bookingType
      });
      if (!validation.allowed) {
        validationErrors.push({ bookingId: b.id, bookingDate: b.bookingDate, violations: validation.blockers });
      }
    }

    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'One or more selected instances failed validation',
        validationErrors
      });
    }

    await query(
      `UPDATE bookings
       SET start_time = $1,
           end_time = $2,
           duration_minutes = $3,
           booking_type = COALESCE($4, booking_type),
           notes = $5,
           updated_at = CURRENT_TIMESTAMP
       WHERE series_id = $6
         AND id = ANY($7::uuid[])`,
      [startTime, endTime, durationMinutes, bookingType || null, notes || null, seriesId, bookingIds]
    );

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error editing selected series instances:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/admin/booking-series/:seriesId/instances
 * Cancel selected dates/instances in a recurring series
 */
router.delete('/booking-series/:seriesId/instances', async (req, res) => {
  const { seriesId } = req.params;
  const { bookingIds } = req.body;

  if (!Array.isArray(bookingIds) || bookingIds.length === 0) {
    return res.status(400).json({ success: false, error: 'bookingIds is required' });
  }

  try {
    const deleted = await query(
      `DELETE FROM bookings b
       WHERE series_id = $1
         AND id = ANY($2::uuid[])`,
      [seriesId, bookingIds]
    );

    if ((deleted.rowCount || 0) !== bookingIds.length) {
      return res.status(400).json({
        success: false,
        error: 'One or more selected bookings were not found in this recurring series'
      });
    }

    const remaining = await query(
      `SELECT COUNT(*)::int as count
       FROM bookings
       WHERE series_id = $1`,
      [seriesId]
    );

    if ((remaining.rows[0]?.count || 0) === 0) {
      await query(`DELETE FROM booking_series WHERE id = $1`, [seriesId]);
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting selected series instances:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/admin/analytics/:facilityId
 * Get analytics data for a facility
 */
router.get('/analytics/:facilityId', async (req, res) => {
  try {
    const { facilityId } = req.params;
    const { period = '30' } = req.query; // Days to analyze
    const periodInt = parseInt(period as string);

    // Bookings over time
    const bookingsTrendResult = await query(`
      SELECT
        DATE(booking_date) as date,
        COUNT(*) as bookings
      FROM bookings
      WHERE facility_id = $1
        AND booking_date >= CURRENT_DATE - INTERVAL '${periodInt} days'
        AND status != 'cancelled'
      GROUP BY DATE(booking_date)
      ORDER BY date
    `, [facilityId]);

    // Peak hours
    const peakHoursResult = await query(`
      SELECT
        EXTRACT(HOUR FROM start_time) as hour,
        COUNT(*) as bookings
      FROM bookings
      WHERE facility_id = $1
        AND booking_date >= CURRENT_DATE - INTERVAL '${periodInt} days'
        AND status != 'cancelled'
      GROUP BY EXTRACT(HOUR FROM start_time)
      ORDER BY bookings DESC
    `, [facilityId]);

    // Court usage
    const courtUsageResult = await query(`
      SELECT
        c.name as court_name,
        c.court_number as court_number,
        COUNT(b.id) as bookings
      FROM courts c
      LEFT JOIN bookings b ON c.id = b.court_id
        AND b.booking_date >= CURRENT_DATE - INTERVAL '${periodInt} days'
        AND b.status != 'cancelled'
      WHERE c.facility_id = $1
      GROUP BY c.id, c.name, c.court_number
      ORDER BY bookings DESC
    `, [facilityId]);

    // Member growth
    const memberGrowthResult = await query(`
      SELECT
        DATE(start_date) as date,
        COUNT(*) as new_members
      FROM facility_memberships
      WHERE facility_id = $1
        AND start_date >= CURRENT_DATE - INTERVAL '${periodInt} days'
      GROUP BY DATE(start_date)
      ORDER BY date
    `, [facilityId]);

    // Day of week analysis
    const dayOfWeekResult = await query(`
      SELECT
        EXTRACT(DOW FROM booking_date) as day_of_week,
        COUNT(*) as bookings
      FROM bookings
      WHERE facility_id = $1
        AND booking_date >= CURRENT_DATE - INTERVAL '${periodInt} days'
        AND status != 'cancelled'
      GROUP BY EXTRACT(DOW FROM booking_date)
      ORDER BY day_of_week
    `, [facilityId]);

    // Hourly heatmap by day of week
    const heatmapResult = await query(`
      SELECT
        EXTRACT(DOW FROM booking_date) as day_of_week,
        EXTRACT(HOUR FROM start_time) as hour,
        COUNT(*) as bookings
      FROM bookings
      WHERE facility_id = $1
        AND booking_date >= CURRENT_DATE - INTERVAL '${periodInt} days'
        AND status != 'cancelled'
      GROUP BY EXTRACT(DOW FROM booking_date), EXTRACT(HOUR FROM start_time)
      ORDER BY day_of_week, hour
    `, [facilityId]);

    // Booking status breakdown
    const statusBreakdownResult = await query(`
      SELECT
        status,
        COUNT(*) as count
      FROM bookings
      WHERE facility_id = $1
        AND booking_date >= CURRENT_DATE - INTERVAL '${periodInt} days'
      GROUP BY status
      ORDER BY count DESC
    `, [facilityId]);

    // Court utilization details (hours booked vs available)
    const courtUtilizationResult = await query(`
      SELECT
        c.name as court_name,
        c.court_number,
        COUNT(b.id) as total_bookings,
        COALESCE(SUM(b.duration_minutes), 0) as total_minutes_booked
      FROM courts c
      LEFT JOIN bookings b ON c.id = b.court_id
        AND b.booking_date >= CURRENT_DATE - INTERVAL '${periodInt} days'
        AND b.status NOT IN ('cancelled')
      WHERE c.facility_id = $1
      GROUP BY c.id, c.name, c.court_number
      ORDER BY c.court_number
    `, [facilityId]);

    // Top bookers (members with most bookings)
    const topBookersResult = await query(`
      SELECT
        u.full_name as member_name,
        u.email,
        COUNT(b.id) as booking_count,
        COALESCE(SUM(b.duration_minutes), 0) as total_minutes
      FROM bookings b
      JOIN users u ON b.user_id = u.id
      WHERE b.facility_id = $1
        AND b.booking_date >= CURRENT_DATE - INTERVAL '${periodInt} days'
        AND b.status != 'cancelled'
      GROUP BY u.id, u.full_name, u.email
      ORDER BY booking_count DESC
      LIMIT 10
    `, [facilityId]);

    res.json({
      success: true,
      data: {
        bookingsTrend: bookingsTrendResult.rows,
        peakHours: peakHoursResult.rows,
        courtUsage: courtUsageResult.rows,
        memberGrowth: memberGrowthResult.rows,
        dayOfWeek: dayOfWeekResult.rows,
        heatmap: heatmapResult.rows,
        statusBreakdown: statusBreakdownResult.rows,
        courtUtilization: courtUtilizationResult.rows,
        topBookers: topBookersResult.rows
      }
    });
  } catch (error: any) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/admin/email-blast/:facilityId
 * Send email blast to facility members
 */
router.post('/email-blast/:facilityId', async (req, res) => {
  try {
    const { facilityId } = req.params;
    const { subject, message, recipientFilter } = req.body;

    if (!subject || !message) {
      return res.status(400).json({
        success: false,
        error: 'Subject and message are required'
      });
    }

    // Get facility name
    const facilityResult = await query(
      'SELECT name FROM facilities WHERE id = $1',
      [facilityId]
    );

    if (facilityResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Facility not found'
      });
    }

    const facilityName = facilityResult.rows[0].name;

    // Get members with their emails
    let membersQuery = `
      SELECT
        u.id as "userId",
        u.email,
        u.full_name as "fullName",
        fm.status,
        fm.membership_type as "membershipType"
      FROM facility_memberships fm
      JOIN users u ON fm.user_id = u.id
      WHERE fm.facility_id = $1
    `;

    const params: any[] = [facilityId];

    // Apply filter
    if (recipientFilter && recipientFilter !== 'all') {
      if (['active', 'pending', 'suspended', 'expired'].includes(recipientFilter)) {
        membersQuery += ' AND fm.status = $2';
        params.push(recipientFilter);
      } else {
        // Filter by membership type
        membersQuery += ' AND fm.membership_type = $2';
        params.push(recipientFilter);
      }
    }

    const membersResult = await query(membersQuery, params);
    const recipients = membersResult.rows;

    if (recipients.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No recipients match the selected filter'
      });
    }

    // Send emails and in-app notifications
    const emailResults = await Promise.allSettled(
      recipients.map((member: any) =>
        sendAnnouncementEmail(
          member.email,
          member.fullName,
          subject,
          message,
          facilityName
        )
      )
    );

    // Create in-app notifications for all recipients
    const userIds = recipients.map((m: any) => m.userId);
    try {
      await notificationService.notifyFacilityAnnouncement(userIds, subject, message);
    } catch (notifError) {
      console.error('Error creating in-app notifications:', notifError);
    }

    const normalizedResults = emailResults.map((result, index) => {
      const recipient = recipients[index];

      if (result.status === 'fulfilled') {
        return {
          email: recipient.email,
          success: result.value.success,
          error: result.value.error,
        };
      }

      return {
        email: recipient.email,
        success: false,
        error: result.reason instanceof Error ? result.reason.message : 'Unknown email send error',
      };
    });

    const sent = normalizedResults.filter(r => r.success).length;
    const failed = recipients.length - sent;
    const firstErrorMessage = normalizedResults.find(r => !r.success)?.error;

    res.json({
      success: true,
      data: {
        sent,
        failed,
        total: recipients.length,
        errorMessage: firstErrorMessage
      }
    });
  } catch (error: any) {
    console.error('Error sending email blast:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// =====================================================
// EMAIL TEMPLATE MANAGEMENT
// =====================================================

/**
 * GET /api/admin/email-templates/:facilityId
 * Get all email templates for a facility (custom + defaults for missing types)
 */
router.get('/email-templates/:facilityId', async (req, res) => {
  try {
    const { facilityId } = req.params;

    // Get all custom templates for this facility
    const result = await query(
      `SELECT id, facility_id as "facilityId", template_type as "templateType",
              subject, body_html as "bodyHtml", is_enabled as "isEnabled",
              created_at as "createdAt", updated_at as "updatedAt"
       FROM email_templates
       WHERE facility_id = $1`,
      [facilityId]
    );

    const customTemplates = result.rows;
    const customMap = new Map(customTemplates.map(t => [t.templateType, t]));

    // Build complete list with defaults for any missing types
    const templates = Object.entries(EMAIL_TEMPLATE_TYPES).map(([type, config]) => {
      const custom = customMap.get(type);
      return {
        id: custom?.id || null,
        templateType: type,
        subject: custom?.subject || config.defaultSubject,
        bodyHtml: custom?.bodyHtml || config.defaultBody,
        isEnabled: custom ? custom.isEnabled : true,
        isCustom: !!custom,
        label: config.label,
        description: config.description,
        availableVariables: config.availableVariables,
      };
    });

    res.json({ success: true, templates });
  } catch (error: any) {
    console.error('Error fetching email templates:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/admin/email-templates/:facilityId/:templateType
 * Upsert (create or update) a custom email template
 */
router.put('/email-templates/:facilityId/:templateType', async (req, res) => {
  try {
    const { facilityId, templateType } = req.params;
    const { subject, bodyHtml, isEnabled } = req.body;

    if (!EMAIL_TEMPLATE_TYPES[templateType]) {
      return res.status(400).json({ success: false, error: 'Invalid template type' });
    }

    if (!subject || !bodyHtml) {
      return res.status(400).json({ success: false, error: 'Subject and body are required' });
    }

    const result = await query(
      `INSERT INTO email_templates (facility_id, template_type, subject, body_html, is_enabled)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (facility_id, template_type)
       DO UPDATE SET subject = $3, body_html = $4, is_enabled = $5, updated_at = CURRENT_TIMESTAMP
       RETURNING id, template_type as "templateType", subject, body_html as "bodyHtml", is_enabled as "isEnabled"`,
      [facilityId, templateType, subject, bodyHtml, isEnabled !== false]
    );

    res.json({ success: true, template: result.rows[0] });
  } catch (error: any) {
    console.error('Error saving email template:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/admin/email-templates/:facilityId/:templateType
 * Reset a template to default (delete the custom template row)
 */
router.delete('/email-templates/:facilityId/:templateType', async (req, res) => {
  try {
    const { facilityId, templateType } = req.params;

    await query(
      'DELETE FROM email_templates WHERE facility_id = $1 AND template_type = $2',
      [facilityId, templateType]
    );

    res.json({ success: true, message: 'Template reset to default' });
  } catch (error: any) {
    console.error('Error resetting email template:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/admin/email-templates/:facilityId/:templateType/preview
 * Preview a template with sample data
 */
router.post('/email-templates/:facilityId/:templateType/preview', async (req, res) => {
  try {
    const { templateType } = req.params;
    const { subject, bodyHtml } = req.body;

    const config = EMAIL_TEMPLATE_TYPES[templateType];
    if (!config) {
      return res.status(400).json({ success: false, error: 'Invalid template type' });
    }

    const sampleVars = getSampleVariables(templateType);
    const renderedSubject = renderTemplate(subject || config.defaultSubject, sampleVars);
    const renderedBody = renderTemplate(bodyHtml || config.defaultBody, sampleVars);
    const renderedHtml = wrapInEmailLayout(renderedBody, sampleVars.facilityName || 'Your Facility');

    res.json({ success: true, renderedSubject, renderedHtml });
  } catch (error: any) {
    console.error('Error previewing email template:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =====================================================
// ADMIN MANAGEMENT
// =====================================================

/**
 * GET /api/admin/admins/:facilityId
 * Get all admins for a facility
 */
router.get('/admins/:facilityId', async (req, res) => {
  try {
    const { facilityId } = req.params;
    const admins = await getFacilityAdmins(facilityId);
    res.json({ success: true, data: admins });
  } catch (error: any) {
    console.error('Error fetching facility admins:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/admin/admins/:facilityId/invite
 * Invite a new admin to a facility via email
 */
router.post('/admins/:facilityId/invite', async (req, res) => {
  try {
    const { facilityId } = req.params;
    const { email, invitedBy } = req.body;

    if (!email || !invitedBy) {
      return res.status(400).json({ success: false, error: 'Email and invitedBy are required' });
    }

    const invitation = await inviteAdmin(facilityId, email, invitedBy);
    res.json({ success: true, data: invitation });
  } catch (error: any) {
    console.error('Error inviting admin:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/admin/admins/:adminId
 * Remove an admin from a facility
 */
router.delete('/admins/:adminId', async (req, res) => {
  try {
    const { adminId } = req.params;
    const { removedBy } = req.body;

    await removeAdmin(adminId, removedBy);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error removing admin:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/admin/terms/:facilityId
 * Get current and historical Terms & Conditions versions for a facility
 */
router.get('/terms/:facilityId', async (req, res) => {
  try {
    const { facilityId } = req.params;
    const [currentVersion, versions] = await Promise.all([
      getCurrentTermsVersion(facilityId),
      getTermsVersionHistory(facilityId),
    ]);

    res.json({
      success: true,
      data: {
        currentVersion,
        versions,
      }
    });
  } catch (error: any) {
    console.error('Error fetching Terms & Conditions:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/admin/terms/:facilityId
 * Publish a new Terms & Conditions version for a facility
 */
router.put('/terms/:facilityId', async (req, res) => {
  try {
    const { facilityId } = req.params;
    const { contentHtml } = req.body;

    if (!contentHtml || typeof contentHtml !== 'string' || !contentHtml.trim()) {
      return res.status(400).json({ success: false, error: 'contentHtml is required' });
    }

    const createdBy = req.user?.userId;
    const version = await publishTermsVersion(facilityId, contentHtml, createdBy);

    res.json({
      success: true,
      data: {
        version
      },
      message: 'Terms & Conditions published successfully'
    });
  } catch (error: any) {
    console.error('Error publishing Terms & Conditions:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/admin/terms/:facilityId/acceptance
 * Get acceptance summary for the currently published Terms & Conditions
 */
router.get('/terms/:facilityId/acceptance', async (req, res) => {
  try {
    const { facilityId } = req.params;
    const summary = await getTermsAcceptanceSummaryForFacility(facilityId);

    res.json({
      success: true,
      data: summary
    });
  } catch (error: any) {
    console.error('Error fetching Terms acceptance summary:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
