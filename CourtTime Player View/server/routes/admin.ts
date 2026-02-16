/**
 * Admin API Routes
 * Handles admin-specific operations for facility management
 */

import express from 'express';
import { query } from '../../src/database/connection';

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
      amenities,
      operatingHours,
      logoUrl
    } = req.body;

    const result = await query(`
      UPDATE facilities
      SET
        name = COALESCE($1, name),
        type = COALESCE($2, type),
        address = COALESCE($3, address),
        phone = COALESCE($4, phone),
        email = COALESCE($5, email),
        description = COALESCE($6, description),
        amenities = COALESCE($7, amenities),
        operating_hours = COALESCE($8, operating_hours),
        street_address = COALESCE($9, street_address),
        city = COALESCE($10, city),
        state = COALESCE($11, state),
        zip_code = COALESCE($12, zip_code),
        logo_url = COALESCE($13, logo_url),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $14
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
        amenities,
        operating_hours as "operatingHours",
        logo_url as "logoUrl",
        created_at as "createdAt",
        updated_at as "updatedAt"
    `, [name, type, address, phone, email, description, amenities, operatingHours, streetAddress, city, state, zipCode, logoUrl, facilityId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Facility not found'
      });
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
        status = COALESCE($7, status),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $8
      RETURNING
        id,
        facility_id as "facilityId",
        name,
        court_number as "courtNumber",
        surface_type as "surfaceType",
        court_type as "courtType",
        is_indoor as "isIndoor",
        has_lights as "hasLights",
        status,
        created_at as "createdAt",
        updated_at as "updatedAt"
    `, [name, courtNumber, surfaceType, courtType, isIndoor, hasLights, status, courtId]);

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
 * GET /api/admin/bookings/:facilityId
 * Get all bookings for a facility with filters
 */
router.get('/bookings/:facilityId', async (req, res) => {
  try {
    const { facilityId } = req.params;
    const { status, startDate, endDate, courtId } = req.query;

    let queryText = `
      SELECT
        b.id,
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
        c.name as "courtName",
        c.court_number as "courtNumber",
        u.full_name as "userName",
        u.email as "userEmail"
      FROM bookings b
      JOIN courts c ON b.court_id = c.id
      JOIN users u ON b.user_id = u.id
      WHERE b.facility_id = $1
    `;

    const params: any[] = [facilityId];
    let paramCount = 1;

    if (status && status !== 'all') {
      paramCount++;
      queryText += ` AND b.status = $${paramCount}`;
      params.push(status);
    }

    if (startDate) {
      paramCount++;
      queryText += ` AND b.booking_date >= $${paramCount}`;
      params.push(startDate);
    }

    if (endDate) {
      paramCount++;
      queryText += ` AND b.booking_date <= $${paramCount}`;
      params.push(endDate);
    }

    if (courtId && courtId !== 'all') {
      paramCount++;
      queryText += ` AND b.court_id = $${paramCount}`;
      params.push(courtId);
    }

    queryText += ` ORDER BY b.booking_date DESC, b.start_time DESC`;

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

export default router;
