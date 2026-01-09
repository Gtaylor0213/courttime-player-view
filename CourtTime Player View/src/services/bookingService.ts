import { query, transaction } from '../database/connection';
import { rulesEngine, EvaluationResult, RuleResult, BookingRequest } from './rulesEngine';

export interface Booking {
  id: string;
  courtId: string;
  userId: string;
  facilityId: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  status: 'confirmed' | 'pending' | 'cancelled' | 'completed';
  bookingType?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  // Joined data
  courtName?: string;
  userName?: string;
  userEmail?: string;
}

/**
 * Get bookings for a specific facility and date
 */
export async function getBookingsByFacilityAndDate(
  facilityId: string,
  bookingDate: string
): Promise<Booking[]> {
  try {
    const result = await query(
      `SELECT
        b.id,
        b.court_id as "courtId",
        b.user_id as "userId",
        b.facility_id as "facilityId",
        TO_CHAR(b.booking_date, 'YYYY-MM-DD') as "bookingDate",
        b.start_time as "startTime",
        b.end_time as "endTime",
        b.duration_minutes as "durationMinutes",
        b.status,
        b.booking_type as "bookingType",
        b.notes,
        b.created_at as "createdAt",
        b.updated_at as "updatedAt",
        c.name as "courtName",
        u.full_name as "userName",
        u.email as "userEmail"
      FROM bookings b
      JOIN courts c ON b.court_id = c.id
      JOIN users u ON b.user_id = u.id
      WHERE b.facility_id = $1
        AND b.booking_date = $2
        AND b.status != 'cancelled'
      ORDER BY b.start_time`,
      [facilityId, bookingDate]
    );

    return result.rows;
  } catch (error) {
    console.error('Error fetching bookings:', error);
    return [];
  }
}

/**
 * Get bookings for a specific court and date
 */
export async function getBookingsByCourtAndDate(
  courtId: string,
  bookingDate: string
): Promise<Booking[]> {
  try {
    const result = await query(
      `SELECT
        b.id,
        b.court_id as "courtId",
        b.user_id as "userId",
        b.facility_id as "facilityId",
        TO_CHAR(b.booking_date, 'YYYY-MM-DD') as "bookingDate",
        b.start_time as "startTime",
        b.end_time as "endTime",
        b.duration_minutes as "durationMinutes",
        b.status,
        b.booking_type as "bookingType",
        b.notes,
        b.created_at as "createdAt",
        b.updated_at as "updatedAt",
        c.name as "courtName",
        u.full_name as "userName",
        u.email as "userEmail"
      FROM bookings b
      JOIN courts c ON b.court_id = c.id
      JOIN users u ON b.user_id = u.id
      WHERE b.court_id = $1
        AND b.booking_date = $2
        AND b.status != 'cancelled'
      ORDER BY b.start_time`,
      [courtId, bookingDate]
    );

    return result.rows;
  } catch (error) {
    console.error('Error fetching bookings:', error);
    return [];
  }
}

/**
 * Get bookings for a specific user
 */
export async function getBookingsByUser(
  userId: string,
  upcoming: boolean = true
): Promise<Booking[]> {
  try {
    const query_text = upcoming
      ? `SELECT
          b.id,
          b.court_id as "courtId",
          b.user_id as "userId",
          b.facility_id as "facilityId",
          TO_CHAR(b.booking_date, 'YYYY-MM-DD') as "bookingDate",
          b.start_time as "startTime",
          b.end_time as "endTime",
          b.duration_minutes as "durationMinutes",
          b.status,
          b.booking_type as "bookingType",
          b.notes,
          b.created_at as "createdAt",
          b.updated_at as "updatedAt",
          c.name as "courtName",
          f.name as "facilityName"
        FROM bookings b
        JOIN courts c ON b.court_id = c.id
        JOIN facilities f ON b.facility_id = f.id
        WHERE b.user_id = $1
          AND b.booking_date >= CURRENT_DATE
          AND b.status != 'cancelled'
        ORDER BY b.booking_date, b.start_time`
      : `SELECT
          b.id,
          b.court_id as "courtId",
          b.user_id as "userId",
          b.facility_id as "facilityId",
          TO_CHAR(b.booking_date, 'YYYY-MM-DD') as "bookingDate",
          b.start_time as "startTime",
          b.end_time as "endTime",
          b.duration_minutes as "durationMinutes",
          b.status,
          b.booking_type as "bookingType",
          b.notes,
          b.created_at as "createdAt",
          b.updated_at as "updatedAt",
          c.name as "courtName",
          f.name as "facilityName"
        FROM bookings b
        JOIN courts c ON b.court_id = c.id
        JOIN facilities f ON b.facility_id = f.id
        WHERE b.user_id = $1
          AND b.booking_date < CURRENT_DATE
          AND b.status != 'cancelled'
        ORDER BY b.booking_date DESC, b.start_time DESC`;

    const result = await query(query_text, [userId]);
    return result.rows;
  } catch (error) {
    console.error('Error fetching user bookings:', error);
    return [];
  }
}

/**
 * Extended booking result with rule information
 */
export interface BookingResult {
  success: boolean;
  booking?: Booking;
  error?: string;
  ruleViolations?: RuleResult[];
  warnings?: RuleResult[];
  isPrimeTime?: boolean;
}

/**
 * Validate a booking without creating it
 */
export async function validateBooking(bookingData: {
  courtId: string;
  userId: string;
  facilityId: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  bookingType?: string;
  activityType?: string;
}): Promise<EvaluationResult> {
  const request: BookingRequest = {
    userId: bookingData.userId,
    courtId: bookingData.courtId,
    facilityId: bookingData.facilityId,
    bookingDate: bookingData.bookingDate,
    startTime: bookingData.startTime,
    endTime: bookingData.endTime,
    durationMinutes: bookingData.durationMinutes,
    bookingType: bookingData.bookingType,
    activityType: bookingData.activityType
  };

  return rulesEngine.validate(request);
}

/**
 * Create a new booking with rule validation
 */
export async function createBooking(bookingData: {
  courtId: string;
  userId: string;
  facilityId: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  bookingType?: string;
  activityType?: string;
  notes?: string;
  skipRulesValidation?: boolean;  // For admin override
}): Promise<BookingResult> {
  try {
    // Record rate limit action
    await recordRateLimitAction(bookingData.userId, bookingData.facilityId, 'create');

    // Evaluate booking rules (unless skipped for admin override)
    if (!bookingData.skipRulesValidation) {
      const request: BookingRequest = {
        userId: bookingData.userId,
        courtId: bookingData.courtId,
        facilityId: bookingData.facilityId,
        bookingDate: bookingData.bookingDate,
        startTime: bookingData.startTime,
        endTime: bookingData.endTime,
        durationMinutes: bookingData.durationMinutes,
        bookingType: bookingData.bookingType,
        activityType: bookingData.activityType
      };

      const evaluation = await rulesEngine.evaluate(request);

      if (!evaluation.allowed) {
        return {
          success: false,
          error: evaluation.blockers[0]?.message || 'Booking not allowed due to rule violations',
          ruleViolations: evaluation.blockers,
          warnings: evaluation.warnings,
          isPrimeTime: evaluation.isPrimeTime
        };
      }

      // Store warnings and prime time status for response
      var isPrimeTime = evaluation.isPrimeTime;
      var warnings = evaluation.warnings;
    }

    // Check for time slot conflicts (basic availability)
    const conflicts = await query(
      `SELECT id FROM bookings
       WHERE court_id = $1
         AND booking_date = $2
         AND status != 'cancelled'
         AND (
           (start_time <= $3 AND end_time > $3)
           OR (start_time < $4 AND end_time >= $4)
           OR (start_time >= $3 AND end_time <= $4)
         )`,
      [bookingData.courtId, bookingData.bookingDate, bookingData.startTime, bookingData.endTime]
    );

    if (conflicts.rows.length > 0) {
      return {
        success: false,
        error: 'Time slot is already booked'
      };
    }

    // Insert the booking
    const result = await query(
      `INSERT INTO bookings (
        court_id, user_id, facility_id, booking_date,
        start_time, end_time, duration_minutes, booking_type,
        activity_type, notes, status, is_prime_time
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'confirmed', $11)
      RETURNING
        id,
        court_id as "courtId",
        user_id as "userId",
        facility_id as "facilityId",
        TO_CHAR(booking_date, 'YYYY-MM-DD') as "bookingDate",
        start_time as "startTime",
        end_time as "endTime",
        duration_minutes as "durationMinutes",
        status,
        booking_type as "bookingType",
        activity_type as "activityType",
        notes,
        is_prime_time as "isPrimeTime",
        created_at as "createdAt",
        updated_at as "updatedAt"`,
      [
        bookingData.courtId,
        bookingData.userId,
        bookingData.facilityId,
        bookingData.bookingDate,
        bookingData.startTime,
        bookingData.endTime,
        bookingData.durationMinutes,
        bookingData.bookingType || null,
        bookingData.activityType || null,
        bookingData.notes || null,
        isPrimeTime || false
      ]
    );

    return {
      success: true,
      booking: result.rows[0],
      warnings: warnings || [],
      isPrimeTime: isPrimeTime || false
    };
  } catch (error) {
    console.error('Error creating booking:', error);
    return {
      success: false,
      error: 'Failed to create booking'
    };
  }
}

/**
 * Create booking with admin override (bypasses rules)
 */
export async function createBookingWithOverride(
  bookingData: {
    courtId: string;
    userId: string;
    facilityId: string;
    bookingDate: string;
    startTime: string;
    endTime: string;
    durationMinutes: number;
    bookingType?: string;
    activityType?: string;
    notes?: string;
  },
  adminId: string,
  overrideReason: string
): Promise<BookingResult> {
  try {
    const request: BookingRequest = {
      userId: bookingData.userId,
      courtId: bookingData.courtId,
      facilityId: bookingData.facilityId,
      bookingDate: bookingData.bookingDate,
      startTime: bookingData.startTime,
      endTime: bookingData.endTime,
      durationMinutes: bookingData.durationMinutes,
      bookingType: bookingData.bookingType,
      activityType: bookingData.activityType
    };

    // Evaluate with override
    const evaluation = await rulesEngine.evaluateWithOverride(request, {
      adminId,
      reason: overrideReason,
      timestamp: new Date()
    });

    // Check for time slot conflicts
    const conflicts = await query(
      `SELECT id FROM bookings
       WHERE court_id = $1
         AND booking_date = $2
         AND status != 'cancelled'
         AND (
           (start_time <= $3 AND end_time > $3)
           OR (start_time < $4 AND end_time >= $4)
           OR (start_time >= $3 AND end_time <= $4)
         )`,
      [bookingData.courtId, bookingData.bookingDate, bookingData.startTime, bookingData.endTime]
    );

    if (conflicts.rows.length > 0) {
      return {
        success: false,
        error: 'Time slot is already booked'
      };
    }

    // Build override info
    const ruleOverrides = evaluation.blockers.map(b => b.ruleCode);

    // Insert the booking with override info
    const result = await query(
      `INSERT INTO bookings (
        court_id, user_id, facility_id, booking_date,
        start_time, end_time, duration_minutes, booking_type,
        activity_type, notes, status, is_prime_time,
        rule_overrides, override_reason, overridden_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'confirmed', $11, $12, $13, $14)
      RETURNING
        id,
        court_id as "courtId",
        user_id as "userId",
        facility_id as "facilityId",
        TO_CHAR(booking_date, 'YYYY-MM-DD') as "bookingDate",
        start_time as "startTime",
        end_time as "endTime",
        duration_minutes as "durationMinutes",
        status,
        booking_type as "bookingType",
        activity_type as "activityType",
        notes,
        is_prime_time as "isPrimeTime",
        created_at as "createdAt",
        updated_at as "updatedAt"`,
      [
        bookingData.courtId,
        bookingData.userId,
        bookingData.facilityId,
        bookingData.bookingDate,
        bookingData.startTime,
        bookingData.endTime,
        bookingData.durationMinutes,
        bookingData.bookingType || null,
        bookingData.activityType || null,
        bookingData.notes || null,
        evaluation.isPrimeTime,
        JSON.stringify(ruleOverrides),
        overrideReason,
        adminId
      ]
    );

    return {
      success: true,
      booking: result.rows[0],
      warnings: evaluation.warnings,
      isPrimeTime: evaluation.isPrimeTime
    };
  } catch (error) {
    console.error('Error creating booking with override:', error);
    return {
      success: false,
      error: 'Failed to create booking'
    };
  }
}

/**
 * Cancellation result with rule information
 */
export interface CancellationResult {
  success: boolean;
  error?: string;
  isLateCancel?: boolean;
  strikeIssued?: boolean;
  message?: string;
}

/**
 * Cancel a booking with rule evaluation
 */
export async function cancelBooking(
  bookingId: string,
  userId: string,
  reason?: string
): Promise<CancellationResult> {
  try {
    // Get booking details first
    const bookingResult = await query(
      `SELECT
        b.id,
        b.facility_id as "facilityId",
        b.booking_date as "bookingDate",
        b.start_time as "startTime",
        b.user_id as "userId"
      FROM bookings b
      WHERE b.id = $1 AND b.user_id = $2 AND b.status != 'cancelled'`,
      [bookingId, userId]
    );

    if (bookingResult.rows.length === 0) {
      return {
        success: false,
        error: 'Booking not found or unauthorized'
      };
    }

    const booking = bookingResult.rows[0];

    // Evaluate cancellation rules
    const cancellationEval = await rulesEngine.evaluateCancellation({
      bookingId,
      userId,
      facilityId: booking.facilityId,
      reason
    });

    // Record rate limit action
    await recordRateLimitAction(userId, booking.facilityId, 'cancel');

    // Calculate minutes before start
    const bookingStart = new Date(`${booking.bookingDate}T${booking.startTime}`);
    const now = new Date();
    const minutesBeforeStart = Math.floor((bookingStart.getTime() - now.getTime()) / 60000);

    // Update booking status
    await query(
      `UPDATE bookings
       SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [bookingId]
    );

    // Record cancellation
    const cancellationId = await recordCancellation(
      bookingId,
      userId,
      booking.facilityId,
      bookingStart,
      minutesBeforeStart,
      cancellationEval.isLateCancel,
      reason
    );

    // Issue strike if late cancel
    let strikeId: string | undefined;
    if (cancellationEval.strikeWillBeIssued) {
      strikeId = await issueStrike(
        userId,
        booking.facilityId,
        'late_cancel',
        `Late cancellation: canceled ${minutesBeforeStart} minutes before start`,
        bookingId
      );

      // Update cancellation with strike ID
      if (strikeId) {
        await query(
          `UPDATE booking_cancellations
           SET strike_issued = true, strike_id = $1
           WHERE id = $2`,
          [strikeId, cancellationId]
        );
      }
    }

    return {
      success: true,
      isLateCancel: cancellationEval.isLateCancel,
      strikeIssued: cancellationEval.strikeWillBeIssued,
      message: cancellationEval.message
    };
  } catch (error) {
    console.error('Error cancelling booking:', error);
    return {
      success: false,
      error: 'Failed to cancel booking'
    };
  }
}

/**
 * Get booking by ID
 */
export async function getBookingById(bookingId: string): Promise<Booking | null> {
  try {
    const result = await query(
      `SELECT
        b.id,
        b.court_id as "courtId",
        b.user_id as "userId",
        b.facility_id as "facilityId",
        TO_CHAR(b.booking_date, 'YYYY-MM-DD') as "bookingDate",
        b.start_time as "startTime",
        b.end_time as "endTime",
        b.duration_minutes as "durationMinutes",
        b.status,
        b.booking_type as "bookingType",
        b.notes,
        b.created_at as "createdAt",
        b.updated_at as "updatedAt",
        c.name as "courtName",
        u.full_name as "userName",
        u.email as "userEmail"
      FROM bookings b
      JOIN courts c ON b.court_id = c.id
      JOIN users u ON b.user_id = u.id
      WHERE b.id = $1`,
      [bookingId]
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  } catch (error) {
    console.error('Error fetching booking:', error);
    return null;
  }
}

// =====================================================
// HELPER FUNCTIONS FOR RULES ENGINE
// =====================================================

/**
 * Record a rate limit action
 */
async function recordRateLimitAction(
  userId: string,
  facilityId: string,
  actionType: 'create' | 'cancel' | 'modify' | 'waitlist_join'
): Promise<void> {
  try {
    await query(
      `INSERT INTO booking_rate_limits (user_id, facility_id, action_type)
       VALUES ($1, $2, $3)`,
      [userId, facilityId, actionType]
    );
  } catch (error) {
    // Don't fail the booking if rate limit recording fails
    console.error('Failed to record rate limit action:', error);
  }
}

/**
 * Record a booking cancellation
 */
async function recordCancellation(
  bookingId: string,
  userId: string,
  facilityId: string,
  bookingStartTime: Date,
  minutesBeforeStart: number,
  isLateCancel: boolean,
  reason?: string
): Promise<string | undefined> {
  try {
    const result = await query(
      `INSERT INTO booking_cancellations (
        booking_id, user_id, facility_id, booking_start_time,
        minutes_before_start, is_late_cancel, cancel_reason
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id`,
      [bookingId, userId, facilityId, bookingStartTime, minutesBeforeStart, isLateCancel, reason]
    );
    return result.rows[0]?.id;
  } catch (error) {
    console.error('Failed to record cancellation:', error);
    return undefined;
  }
}

/**
 * Issue a strike to a user
 */
async function issueStrike(
  userId: string,
  facilityId: string,
  strikeType: 'no_show' | 'late_cancel' | 'violation' | 'manual',
  reason: string,
  relatedBookingId?: string,
  relatedRuleId?: string,
  issuedBy?: string,
  expiresInDays?: number
): Promise<string | undefined> {
  try {
    const expiresAt = expiresInDays
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
      : null;

    const result = await query(
      `INSERT INTO account_strikes (
        user_id, facility_id, strike_type, strike_reason,
        related_booking_id, related_rule_id, issued_by, expires_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id`,
      [userId, facilityId, strikeType, reason, relatedBookingId, relatedRuleId, issuedBy, expiresAt]
    );
    return result.rows[0]?.id;
  } catch (error) {
    console.error('Failed to issue strike:', error);
    return undefined;
  }
}

/**
 * Get user's active strikes
 */
export async function getUserStrikes(
  userId: string,
  facilityId: string
): Promise<Array<{
  id: string;
  strikeType: string;
  strikeReason: string;
  issuedAt: Date;
  expiresAt?: Date;
}>> {
  try {
    const result = await query(
      `SELECT
        id,
        strike_type as "strikeType",
        strike_reason as "strikeReason",
        issued_at as "issuedAt",
        expires_at as "expiresAt"
      FROM account_strikes
      WHERE user_id = $1
        AND facility_id = $2
        AND revoked = false
        AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
      ORDER BY issued_at DESC`,
      [userId, facilityId]
    );
    return result.rows;
  } catch (error) {
    console.error('Failed to get user strikes:', error);
    return [];
  }
}

/**
 * Mark a booking as no-show
 */
export async function markNoShow(
  bookingId: string,
  facilityId: string,
  markedBy?: string
): Promise<{ success: boolean; strikeId?: string; error?: string }> {
  try {
    // Get booking details
    const bookingResult = await query(
      `SELECT user_id as "userId" FROM bookings WHERE id = $1`,
      [bookingId]
    );

    if (bookingResult.rows.length === 0) {
      return { success: false, error: 'Booking not found' };
    }

    const userId = bookingResult.rows[0].userId;

    // Update booking
    await query(
      `UPDATE bookings
       SET no_show_marked = true, status = 'completed', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [bookingId]
    );

    // Issue strike
    const strikeId = await issueStrike(
      userId,
      facilityId,
      'no_show',
      'Did not show up for reservation',
      bookingId,
      undefined,
      markedBy
    );

    return { success: true, strikeId };
  } catch (error) {
    console.error('Failed to mark no-show:', error);
    return { success: false, error: 'Failed to mark no-show' };
  }
}

/**
 * Check in for a booking
 */
export async function checkInBooking(
  bookingId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const result = await query(
      `UPDATE bookings
       SET checked_in = true, checked_in_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND user_id = $2 AND status = 'confirmed'
       RETURNING id`,
      [bookingId, userId]
    );

    if (result.rows.length === 0) {
      return { success: false, error: 'Booking not found or not confirmed' };
    }

    return { success: true };
  } catch (error) {
    console.error('Failed to check in booking:', error);
    return { success: false, error: 'Failed to check in' };
  }
}
