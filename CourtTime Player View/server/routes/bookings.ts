import express from 'express';
import {
  getBookingsByFacilityAndDate,
  getBookingsByCourtAndDate,
  getBookingsByUser,
  createBooking,
  cancelBooking,
  getBookingById,
  validateBooking,
  createBookingWithOverride,
  markNoShow,
  checkInBooking
} from '../../src/services/bookingService';
import { notificationService } from '../../src/services/notificationService';
import { pool } from '../../src/database/connection';

const router = express.Router();

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
      notes
    } = req.body;

    // Validation
    if (!courtId || !userId || !facilityId || !bookingDate || !startTime || !endTime || !durationMinutes) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields'
      });
    }

    const result = await createBooking({
      courtId,
      userId,
      facilityId,
      bookingDate,
      startTime,
      endTime,
      durationMinutes,
      bookingType,
      notes
    });

    if (!result.success) {
      return res.status(400).json(result);
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

      await notificationService.notifyBookingConfirmed(
        userId,
        facilityName,
        courtName,
        startDateTime,
        endDateTime
      );
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
 * DELETE /api/bookings/:bookingId
 * Cancel a booking
 */
router.delete('/:bookingId', async (req, res, next) => {
  try {
    const { bookingId } = req.params;
    const { userId, reason } = req.query;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'User ID is required'
      });
    }

    // Get booking details before cancelling
    const booking = await getBookingById(bookingId);

    const result = await cancelBooking(bookingId, userId as string, reason as string);

    if (!result.success) {
      return res.status(400).json(result);
    }

    // Create notification for booking cancellation
    if (booking) {
      try {
        const facilityQuery = await pool.query('SELECT name FROM facilities WHERE id = $1', [booking.facilityId]);
        const courtQuery = await pool.query('SELECT name FROM courts WHERE id = $1', [booking.courtId]);

        const facilityName = facilityQuery.rows[0]?.name || 'Your facility';
        const courtName = courtQuery.rows[0]?.name || 'Court';

        const startDateTime = new Date(`${booking.bookingDate}T${booking.startTime}`);

        await notificationService.notifyBookingCancelled(
          userId as string,
          facilityName,
          courtName,
          startDateTime,
          'Cancelled by user'
        );
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
      overriddenBy,
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

    if (!overriddenBy || !overrideReason) {
      return res.status(400).json({
        success: false,
        error: 'Admin override requires overriddenBy and overrideReason'
      });
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
        adminUserId: overriddenBy,
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
    const { bookingId } = req.params;
    const { markedBy, reason } = req.body;

    if (!markedBy) {
      return res.status(400).json({
        success: false,
        error: 'markedBy is required'
      });
    }

    const result = await markNoShow(bookingId, markedBy, reason);

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

    let query = `
      SELECT b.*, c.name as court_name, f.name as facility_name,
             b.is_prime_time, b.rule_overrides
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

    // Get cancellation deadline info
    const bookingsWithInfo = result.rows.map(b => {
      const startDateTime = new Date(`${b.booking_date}T${b.start_time}`);
      const now = new Date();
      const hoursUntilStart = (startDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);

      return {
        ...b,
        hoursUntilStart: Math.round(hoursUntilStart * 10) / 10,
        canCancelWithoutPenalty: hoursUntilStart >= 24, // Default 24 hour cancellation window
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
