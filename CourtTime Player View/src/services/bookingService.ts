import { query, transaction } from '../database/connection';

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
 * Create a new booking
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
  notes?: string;
}): Promise<{ success: boolean; booking?: Booking; error?: string }> {
  try {
    // Check for conflicts
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

    const result = await query(
      `INSERT INTO bookings (
        court_id, user_id, facility_id, booking_date,
        start_time, end_time, duration_minutes, booking_type, notes, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'confirmed')
      RETURNING
        id,
        court_id as "courtId",
        user_id as "userId",
        facility_id as "facilityId",
        booking_date as "bookingDate",
        start_time as "startTime",
        end_time as "endTime",
        duration_minutes as "durationMinutes",
        status,
        booking_type as "bookingType",
        notes,
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
        bookingData.notes || null
      ]
    );

    return {
      success: true,
      booking: result.rows[0]
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
 * Cancel a booking
 */
export async function cancelBooking(
  bookingId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const result = await query(
      `UPDATE bookings
       SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [bookingId, userId]
    );

    if (result.rows.length === 0) {
      return {
        success: false,
        error: 'Booking not found or unauthorized'
      };
    }

    return { success: true };
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
