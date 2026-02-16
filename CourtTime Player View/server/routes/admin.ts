/**
 * Admin API Routes
 * Handles admin-specific operations for facility management
 */

import express from 'express';
import { query } from '../../src/database/connection';
import { sendAnnouncementEmail } from '../../src/services/emailService';
import { notificationService } from '../../src/services/notificationService';
import { EMAIL_TEMPLATE_TYPES, renderTemplate, wrapInEmailLayout, getSampleVariables } from '../../src/services/emailTemplateDefaults';
import { getFacilityLocalNow } from '../../src/services/rulesEngine/RuleContext';
import { combineDateAndTime, minutesBetween } from '../../src/services/rulesEngine/utils/timeUtils';

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
      timezone,
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
        timezone = COALESCE($14, timezone),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $15
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
        timezone,
        logo_url as "logoUrl",
        created_at as "createdAt",
        updated_at as "updatedAt"
    `, [name, type, address, phone, email, description, amenities, operatingHours, streetAddress, city, state, zipCode, logoUrl, timezone, facilityId]);

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

    const sent = emailResults.filter(
      r => r.status === 'fulfilled' && r.value === true
    ).length;
    const failed = recipients.length - sent;

    res.json({
      success: true,
      data: {
        sent,
        failed,
        total: recipients.length
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
// DIAGNOSTIC: Timezone & Rule Engine Debug
// Remove after verifying production works correctly
// =====================================================

/**
 * GET /api/admin/debug/timezone/:facilityId
 * Diagnostic endpoint to verify timezone calculations on production
 */
router.get('/debug/timezone/:facilityId', async (req, res) => {
  try {
    const { facilityId } = req.params;
    const { bookingDate, startTime, endTime } = req.query;

    // Fetch facility timezone
    const facilityResult = await query(
      'SELECT id, name, timezone FROM facilities WHERE id = $1',
      [facilityId]
    );

    if (facilityResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Facility not found' });
    }

    const facility = facilityResult.rows[0];
    const tz = facility.timezone || 'America/New_York';

    // Server raw time
    const serverNow = new Date();

    // Facility-local time (what the fix produces)
    const facilityNow = getFacilityLocalNow(tz);

    // Sample booking comparison
    const sampleDate = (bookingDate as string) || new Date().toISOString().split('T')[0];
    const sampleStart = (startTime as string) || '16:00:00';
    const sampleEnd = (endTime as string) || '17:00:00';

    const bookingStart = combineDateAndTime(sampleDate, sampleStart);
    const bookingEnd = combineDateAndTime(sampleDate, sampleEnd);

    // Minutes calculations
    const minutesUntilStart_withFix = minutesBetween(facilityNow, bookingStart);
    const minutesUntilStart_withoutFix = minutesBetween(serverNow, bookingStart);

    // Rule checks
    const minLeadTime = 15; // ACC-006 default
    const wouldPass_withFix = minutesUntilStart_withFix >= minLeadTime;
    const wouldPass_withoutFix = minutesUntilStart_withoutFix >= minLeadTime;

    res.json({
      success: true,
      facility: {
        id: facility.id,
        name: facility.name,
        timezone: tz,
      },
      serverTime: {
        utcISO: serverNow.toISOString(),
        utcReadable: serverNow.toUTCString(),
        serverLocalString: serverNow.toString(),
        nodeTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      facilityLocalTime: {
        components: {
          year: facilityNow.getFullYear(),
          month: facilityNow.getMonth() + 1,
          day: facilityNow.getDate(),
          hour: facilityNow.getHours(),
          minute: facilityNow.getMinutes(),
          second: facilityNow.getSeconds(),
        },
        readable: facilityNow.toLocaleString('en-US', { hour12: true }),
      },
      sampleBooking: {
        date: sampleDate,
        startTime: sampleStart,
        endTime: sampleEnd,
        bookingStartDate: bookingStart.toString(),
        bookingEndDate: bookingEnd.toString(),
      },
      ruleEngine: {
        ACC006_MinLeadTime: {
          minMinutes: minLeadTime,
          withFix: {
            minutesUntilStart: minutesUntilStart_withFix,
            wouldPass: wouldPass_withFix,
            comparison: `facilityNow(${facilityNow.getHours()}:${String(facilityNow.getMinutes()).padStart(2, '0')}) vs booking(${sampleStart}) = ${minutesUntilStart_withFix} min`,
          },
          withoutFix_OLD: {
            minutesUntilStart: minutesUntilStart_withoutFix,
            wouldPass: wouldPass_withoutFix,
            comparison: `serverUTC(${serverNow.getUTCHours()}:${String(serverNow.getUTCMinutes()).padStart(2, '0')}) vs booking(${sampleStart}) = ${minutesUntilStart_withoutFix} min`,
          },
          fixMadeADifference: wouldPass_withFix !== wouldPass_withoutFix,
        },
      },
    });
  } catch (error: any) {
    console.error('Debug timezone error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
