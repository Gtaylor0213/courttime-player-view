import express from 'express';
import {
  getBookingsByFacilityAndDate,
  getBookingsByFacilityAndDateRange,
  getBookingsByCourtAndDate,
  getBookingsByUser,
  createBooking,
  cancelBooking,
  getBookingById,
  validateBooking,
  createBookingWithOverride,
  markNoShow,
  checkInBooking,
  createRecurringBookingSeries
} from '../../src/services/bookingService';
import {
  acceptCourtWaiverForUser,
  getPendingCourtWaiversForUser,
} from '../../src/services/courtWaiverService';
import { notificationService } from '../../src/services/notificationService';
import { sendBookingConfirmationEmail, sendBookingCancellationEmail } from '../../src/services/emailService';
import { isFeatureEnabled } from '../../src/services/featureFlagService';
import { FEATURE_FLAGS } from '../../shared/constants/featureFlags';
import { query as dbQuery, getPool } from '../../src/database/connection';
import {
  bookingWithDetailsToCalendarDetails,
  buildIcsEventContent,
  buildIcsFilename,
} from '../../shared/utils/bookingCalendar';
const pool = { query: (text: string, params?: any[]) => getPool().query(text, params) };

const router = express.Router();

/**
 * GET /api/bookings/facility/:facilityId/range
 * Get bookings for a facility across a date range (for week/month views)
 */
router.get('/facility/:facilityId/range', async (req, res, next) => {
  try {
    const { facilityId } = req.params;
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'startDate and endDate parameters are required'
      });
    }

    const bookings = await getBookingsByFacilityAndDateRange(
      facilityId,
      startDate as string,
      endDate as string
    );

    res.json({ success: true, bookings });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/bookings/facility/:facilityId
 * Get bookings for a facility on a specific date
 */
router.get('/facility/:facilityId', async (req, res, next) => {
  try {
    const { facilityId } = req.params;
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({
        success: false,
        error: 'Date parameter is required'
      });
    }

    const bookings = await getBookingsByFacilityAndDate(facilityId, date as string);

    res.json({
      success: true,
      bookings
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/bookings/court-waivers/pending?courtIds=a,b,c
 * Court waivers the authenticated user must accept before booking these courts
 */
router.get('/court-waivers/pending', async (req, res, next) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const courtIds = String(req.query.courtIds || '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
    if (courtIds.length === 0) {
      return res.status(400).json({ success: false, error: 'courtIds parameter is required' });
    }

    const pending = await getPendingCourtWaiversForUser(userId, courtIds);
    res.json({ success: true, data: { pending } });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/bookings/court-waivers/accept
 * Record the authenticated user's acceptance of a court's current waiver
 */
router.post('/court-waivers/accept', async (req, res, next) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const { courtId } = req.body;
    if (!courtId || typeof courtId !== 'string') {
      return res.status(400).json({ success: false, error: 'courtId is required' });
    }

    const accepted = await acceptCourtWaiverForUser(userId, courtId, req.ip || null);
    res.json({ success: true, data: accepted });
  } catch (error: any) {
    if (error?.message === 'This court has no waiver to accept') {
      return res.status(400).json({ success: false, error: error.message });
    }
    next(error);
  }
});

/**
 * GET /api/bookings/court/:courtId
 * Get bookings for a specific court on a specific date
 */
router.get('/court/:courtId', async (req, res, next) => {
  try {
    const { courtId } = req.params;
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({
        success: false,
        error: 'Date parameter is required'
      });
    }

    const bookings = await getBookingsByCourtAndDate(courtId, date as string);

    res.json({
      success: true,
      bookings
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/bookings/user/:userId
 * Get bookings for a specific user
 */
router.get('/user/:userId', async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { upcoming } = req.query;
    const callerUserId = req.user?.userId;

    if (callerUserId !== userId && req.user?.userType !== 'admin') {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const bookings = await getBookingsByUser(
      userId,
      upcoming === 'true' || upcoming === undefined
    );

    res.json({
      success: true,
      bookings
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/bookings/:bookingId/calendar.ics
 * Inline ICS for Apple Calendar / Outlook (Content-Disposition: inline opens Calendar.app on Safari).
 */
router.get('/:bookingId/calendar.ics', async (req, res, next) => {
  try {
    const { bookingId } = req.params;
    const callerUserId = req.user?.userId;
    const booking = await getBookingById(bookingId);

    if (!booking) {
      return res.status(404).send('Booking not found');
    }

    if (booking.userId !== callerUserId && req.user?.userType !== 'admin') {
      return res.status(403).send('Access denied');
    }

    let facilityName = '';
    if (booking.facilityId) {
      const facilityRow = await dbQuery('SELECT name FROM facilities WHERE id = $1', [
        booking.facilityId,
      ]);
      facilityName = facilityRow.rows[0]?.name || '';
    }

    const details = bookingWithDetailsToCalendarDetails(
      {
        courtName: booking.courtName,
        facilityName,
        bookingDate: booking.bookingDate,
        startTime: booking.startTime,
        endTime: booking.endTime,
        bookingType: booking.bookingType,
        notes: booking.notes,
      },
      { facilityName }
    );

    const ics = buildIcsEventContent(details);
    const filename = buildIcsFilename(details);

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.send(ics);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/bookings/:bookingId
 * Get a specific booking by ID
 */
router.get('/:bookingId', async (req, res, next) => {
  try {
    const { bookingId } = req.params;

    const booking = await getBookingById(bookingId);

    if (!booking) {
      return res.status(404).json({
        success: false,
        error: 'Booking not found'
      });
    }

    res.json({
      success: true,
      booking
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/bookings
 * Create a new booking
 */
router.post('/', async (req, res, next) => {
  try {
    const {
      courtId,
      userId,
      facilityId,
      bookingDate,
      startTime,
      endTime,
      durationMinutes,
      bookingType,
      notes,
      bringGuest,
      addBallMachine,
      provisionalSameRequestBookings,
      successUrl,
      cancelUrl,
    } = req.body;

    // Validation
    if (!courtId || !facilityId || !bookingDate || !startTime || !endTime || !durationMinutes) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields'
      });
    }

    const callerUserId = req.user?.userId;
    if (!callerUserId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const isAdminCaller = req.user?.userType === 'admin';
    // Admins may book on behalf of another user; regular users always book as themselves
    const effectiveUserId = isAdminCaller ? (userId || callerUserId) : callerUserId;

    // Reject bookings from view-only members (skip check for admins)
    if (!isAdminCaller) {
      const membershipCheck = await dbQuery(
        `SELECT is_view_only FROM facility_memberships WHERE user_id = $1 AND facility_id = $2`,
        [effectiveUserId, facilityId]
      );
      if (membershipCheck.rows[0]?.is_view_only) {
        return res.status(403).json({
          success: false,
          error: 'View-only members cannot make bookings'
        });
      }
    }

    const result = await createBooking({
      courtId,
      userId: effectiveUserId,
      facilityId,
      bookingDate,
      startTime,
      endTime,
      durationMinutes,
      bookingType,
      notes,
      bringGuest: bringGuest === true,
      addBallMachine: addBallMachine === true,
      provisionalSameRequestBookings: Array.isArray(provisionalSameRequestBookings)
        ? provisionalSameRequestBookings
        : undefined,
      successUrl: typeof successUrl === 'string' ? successUrl : undefined,
      cancelUrl: typeof cancelUrl === 'string' ? cancelUrl : undefined,
    });

    if (!result.success) {
      return res.status(400).json(result);
    }

    if (result.requiresPayment && result.checkoutUrl) {
      return res.json({
        success: true,
        requiresPayment: true,
        checkoutUrl: result.checkoutUrl,
        warnings: result.warnings,
        isPrimeTime: result.isPrimeTime,
      });
    }

    // Create notification for booking confirmation
    try {
      // Get booking details for notification
      const facilityQuery = await pool.query('SELECT name FROM facilities WHERE id = $1', [facilityId]);
      const courtQuery = await pool.query('SELECT name FROM courts WHERE id = $1', [courtId]);

      const facilityName = facilityQuery.rows[0]?.name || 'Your facility';
      const courtName = courtQuery.rows[0]?.name || 'Court';

      // Create the start and end datetime objects
      const startDateTime = new Date(`${bookingDate}T${startTime}`);
      const endDateTime = new Date(`${bookingDate}T${endTime}`);

      const created = result.booking;
      await notificationService.notifyBookingConfirmed(
        effectiveUserId,
        facilityName,
        courtName,
        startDateTime,
        endDateTime,
        created?.id
          ? {
              bookingId: created.id,
              facilityId,
              bookingDate,
              courtId,
            }
          : undefined
      );

      // Send confirmation email (fire-and-forget)
      const userQuery = await pool.query(
        'SELECT email, full_name as "fullName" FROM users WHERE id = $1',
        [effectiveUserId]
      );
      const userInfo = userQuery.rows[0];
      if (userInfo) {
        const dateFormatted = new Date(`${bookingDate}T00:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
        const startFormatted = new Date(`${bookingDate}T${startTime}`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        const endFormatted = new Date(`${bookingDate}T${endTime}`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        sendBookingConfirmationEmail(
          userInfo.email, userInfo.fullName, facilityId, facilityName,
          courtName, dateFormatted, startFormatted, endFormatted, bookingType || 'General',
          effectiveUserId
        ).catch(err => console.error('Error sending booking confirmation email:', err));
      }
    } catch (notificationError) {
      console.error('Error creating booking notification:', notificationError);
      // Don't fail the booking if notification fails
    }

    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/bookings/payment/reconcile
 * Recover reservations for PAID court checkouts that never created a booking row.
 */
router.post('/payment/reconcile', async (req, res, next) => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    const { reconcilePaidCourtBookingsWithoutReservation } = await import(
      '../../src/services/bookingService'
    );
    const recovered = await reconcilePaidCourtBookingsWithoutReservation(userId);
    return res.json({
      success: true,
      data: { recovered, count: recovered.length },
      message:
        recovered.length > 0
          ? `Recovered ${recovered.length} paid court reservation(s)`
          : 'No paid reservations needed recovery',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/bookings/payment/confirm
 * Complete a paid court booking after Stripe Checkout redirect.
 */
router.post('/payment/confirm', async (req, res, next) => {
  try {
    const sessionId = String(req.body?.sessionId || '');
    const userId = (req as any).user?.userId;
    if (!sessionId) {
      return res.status(400).json({ success: false, error: 'sessionId is required' });
    }
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    const { confirmCourtBookingCheckout } = await import('../../src/services/stripeConnectService');
    const result = await confirmCourtBookingCheckout({ sessionId, memberId: userId });
    return res.json({
      success: true,
      data: result,
      message: 'Court booking confirmed after payment',
    });
  } catch (error: any) {
    if (
      error?.message?.includes('not belong') ||
      error?.message?.includes('not completed') ||
      error?.message?.includes('not found')
    ) {
      return res.status(400).json({ success: false, error: error.message });
    }
    next(error);
  }
});

/**
 * POST /api/bookings/recurring-series
 * Create recurring bookings as a grouped series
 */
router.post('/recurring-series', async (req, res, next) => {
  try {
    const { userId, facilityId, bookingType, notes, instances } = req.body;
    const callerUserId = req.user?.userId;
    if (!callerUserId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    const isAdminCaller = req.user?.userType === 'admin';
    const effectiveUserId = isAdminCaller ? (userId || callerUserId) : callerUserId;

    if (!effectiveUserId || !facilityId || !Array.isArray(instances) || instances.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields for recurring series'
      });
    }

    if (!isAdminCaller) {
      const playerRecurringEnabled = await isFeatureEnabled(facilityId, FEATURE_FLAGS.PLAYER_RECURRING_BOOKINGS);
      if (!playerRecurringEnabled) {
        return res.status(403).json({
          success: false,
          error: 'Recurring bookings are not enabled for players at this facility'
        });
      }
    }

    const missing = instances.some((i: any) =>
      !i.courtId || !i.bookingDate || !i.startTime || !i.endTime || !i.durationMinutes
    );
    if (missing) {
      return res.status(400).json({
        success: false,
        error: 'Each recurring instance must include courtId, bookingDate, startTime, endTime, and durationMinutes'
      });
    }

    const result = await createRecurringBookingSeries({
      userId: effectiveUserId,
      facilityId,
      bookingType,
      notes,
      instances
    });

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/bookings/:bookingId
 * Cancel a booking
 */
router.delete('/:bookingId', async (req, res, next) => {
  try {
    const { bookingId } = req.params;
    const { reason } = req.query;
    const callerUserId = req.user?.userId;

    if (!callerUserId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    // Get booking details before cancelling
    const booking = await getBookingById(bookingId);

    const result = await cancelBooking(bookingId, callerUserId, reason as string);

    if (!result.success) {
      return res.status(400).json(result);
    }

    // Create notification for booking cancellation
    if (booking) {
      try {
        const notificationRecipientId = booking.userId || callerUserId;
        const facilityQuery = await pool.query('SELECT name FROM facilities WHERE id = $1', [booking.facilityId]);
        const courtQuery = await pool.query('SELECT name FROM courts WHERE id = $1', [booking.courtId]);

        const facilityName = facilityQuery.rows[0]?.name || 'Your facility';
        const courtName = courtQuery.rows[0]?.name || 'Court';

        const startDateTime = new Date(`${booking.bookingDate}T${booking.startTime}`);

        await notificationService.notifyBookingCancelled(
          notificationRecipientId,
          facilityName,
          courtName,
          startDateTime,
          'Cancelled by user',
          {
            bookingId,
            facilityId: booking.facilityId,
            bookingDate: booking.bookingDate,
          }
        );

        // Send cancellation email (fire-and-forget)
        const userQuery = await pool.query(
          'SELECT email, full_name as "fullName" FROM users WHERE id = $1',
          [notificationRecipientId]
        );
        const userInfo = userQuery.rows[0];
        if (userInfo) {
          const dateFormatted = new Date(`${booking.bookingDate}T00:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
          const startFormatted = new Date(`${booking.bookingDate}T${booking.startTime}`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
          sendBookingCancellationEmail(
            userInfo.email, userInfo.fullName, booking.facilityId, facilityName,
            courtName, dateFormatted, startFormatted, (reason as string) || 'Cancelled by user',
            notificationRecipientId
          ).catch(err => console.error('Error sending cancellation email:', err));
        }
      } catch (notificationError) {
        console.error('Error creating cancellation notification:', notificationError);
        // Don't fail the cancellation if notification fails
      }
    }

    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/bookings/validate
 * Pre-validate a booking without creating it
 */
router.post('/validate', async (req, res, next) => {
  try {
    const {
      courtId,
      userId,
      facilityId,
      bookingDate,
      startTime,
      endTime,
      durationMinutes,
      bookingType
    } = req.body;

    // Validation
    if (!courtId || !userId || !facilityId || !bookingDate || !startTime || !endTime || !durationMinutes) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields'
      });
    }

    const result = await validateBooking({
      courtId,
      userId,
      facilityId,
      bookingDate,
      startTime,
      endTime,
      durationMinutes,
      bookingType
    });

    res.json({
      success: true,
      validation: result
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/bookings/admin-override
 * Create a booking with admin override (bypasses rules)
 */
router.post('/admin-override', async (req, res, next) => {
  try {
    const callerUserId = req.user?.userId;
    if (!callerUserId || req.user?.userType !== 'admin') {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }

    const {
      courtId,
      userId,
      facilityId,
      bookingDate,
      startTime,
      endTime,
      durationMinutes,
      bookingType,
      notes,
      overrideReason,
      overrideRules
    } = req.body;

    // Validation
    if (!courtId || !userId || !facilityId || !bookingDate || !startTime || !endTime || !durationMinutes) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields'
      });
    }

    if (!overrideReason) {
      return res.status(400).json({
        success: false,
        error: 'Admin override requires overrideReason'
      });
    }

    // Verify caller is an admin of the target facility
    const adminCheck = await dbQuery(
      `SELECT 1 FROM facility_admins WHERE user_id = $1 AND facility_id = $2 AND status = 'active'`,
      [callerUserId, facilityId]
    );
    if (adminCheck.rows.length === 0) {
      return res.status(403).json({ success: false, error: 'Not an admin of this facility' });
    }

    const result = await createBookingWithOverride(
      {
        courtId,
        userId,
        facilityId,
        bookingDate,
        startTime,
        endTime,
        durationMinutes,
        bookingType,
        notes
      },
      {
        adminUserId: callerUserId,
        reason: overrideReason,
        overriddenRules: overrideRules || []
      }
    );

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/bookings/:bookingId/no-show
 * Mark a booking as no-show and issue strike
 */
router.post('/:bookingId/no-show', async (req, res, next) => {
  try {
    const callerUserId = req.user?.userId;
    if (!callerUserId || req.user?.userType !== 'admin') {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }

    const { bookingId } = req.params;
    const { reason } = req.body;

    const result = await markNoShow(bookingId, callerUserId, reason);

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/bookings/:bookingId/check-in
 * Check in to a booking
 */
router.post('/:bookingId/check-in', async (req, res, next) => {
  try {
    const { bookingId } = req.params;
    const callerUserId = req.user?.userId;
    if (!callerUserId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const bookingForAuth = await getBookingById(bookingId);
    if (!bookingForAuth) {
      return res.status(404).json({ success: false, error: 'Booking not found' });
    }
    if (bookingForAuth.userId !== callerUserId && req.user?.userType !== 'admin') {
      const adminRow = await dbQuery(
        `SELECT 1 FROM facility_admins WHERE user_id = $1 AND facility_id = $2 AND status = 'active'`,
        [callerUserId, bookingForAuth.facilityId]
      );
      if (adminRow.rows.length === 0) {
        return res.status(403).json({ success: false, error: 'Not authorized to check in this booking' });
      }
    }

    const result = await checkInBooking(bookingId);

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/bookings/upcoming/:userId
 * Get upcoming bookings with rule warnings
 */
router.get('/upcoming/:userId', async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { facilityId, limit } = req.query;
    const callerUserId = req.user?.userId;

    if (callerUserId !== userId && req.user?.userType !== 'admin') {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    let query = `
      SELECT
        b.id,
        b.court_id     as "courtId",
        b.user_id      as "userId",
        b.facility_id  as "facilityId",
        b.booking_date as "bookingDate",
        b.start_time   as "startTime",
        b.end_time     as "endTime",
        b.duration_minutes as "durationMinutes",
        b.status,
        b.booking_type as "bookingType",
        b.notes,
        b.is_prime_time as "isPrimeTime",
        b.rule_overrides as "ruleOverrides",
        b.created_at   as "createdAt",
        b.updated_at   as "updatedAt",
        c.name as "courtName",
        f.name as "facilityName"
      FROM bookings b
      JOIN courts c ON b.court_id = c.id
      JOIN facilities f ON b.facility_id = f.id
      WHERE b.user_id = $1
        AND b.status != 'cancelled'
        AND (b.booking_date > CURRENT_DATE
             OR (b.booking_date = CURRENT_DATE AND b.end_time > CURRENT_TIME))
    `;
    const params: any[] = [userId];

    if (facilityId) {
      params.push(facilityId);
      query += ` AND b.facility_id = $${params.length}`;
    }

    query += ` ORDER BY b.booking_date ASC, b.start_time ASC`;

    if (limit) {
      params.push(parseInt(limit as string));
      query += ` LIMIT $${params.length}`;
    }

    const result = await pool.query(query, params);

    // Cancellation is always allowed until reservation end under simplified policy.
    const bookingsWithInfo = result.rows.map((b: any) => {
      const startDateTime = new Date(`${b.bookingDate}T${b.startTime}`);
      const now = new Date();
      const hoursUntilStart = (startDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);

      return {
        ...b,
        hoursUntilStart: Math.round(hoursUntilStart * 10) / 10,
        canCancelWithoutPenalty: true,
        checkInAvailable: hoursUntilStart <= 0.5 && hoursUntilStart >= -0.5 // 30 min window
      };
    });

    res.json({
      success: true,
      bookings: bookingsWithInfo
    });
  } catch (error) {
    next(error);
  }
});

export default router;
