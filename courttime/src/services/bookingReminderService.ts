/**
 * Booking reminders.
 *
 * About an hour before a reservation starts, the member who holds it gets a
 * "starting soon" notification (in-app, plus push if they have it on; the
 * "Booking reminders" push preference is applied by notificationService).
 */

import { query } from '../database/connection';
import { notificationService } from './notificationService';

/** Remind once the start is this close. */
export const REMINDER_LEAD_MINUTES = 60;
/** Too late to be useful: skip, e.g. after the server was down through the window. */
const REMINDER_MIN_LEAD_MINUTES = 10;
/**
 * A booking made this close to its start gets no reminder: the member just
 * chose the time, and "starting soon" a few minutes later is noise.
 */
const SKIP_IF_BOOKED_WITHIN_MINUTES = 120;
/**
 * Someone holding more than this many bookings at one club in a day is running
 * a schedule (a coach's lessons, an admin's court holds), not playing. They
 * would get a reminder every half hour all day, so they get none.
 */
const MAX_DAILY_BOOKINGS_FOR_REMINDERS = 4;

/**
 * booking_date + start_time are wall-clock values in the facility's timezone;
 * created_at is UTC (the database runs in UTC).
 */
const START_AT = `((b.booking_date + b.start_time) AT TIME ZONE COALESCE(NULLIF(f.timezone, ''), 'America/New_York'))`;

/**
 * Selects the due bookings and marks them reminded in one statement, so
 * concurrent sweeps (two instances, or an overlapping run) each get a disjoint
 * set. Not reminded:
 *  - walk-ins and staff holds entered for a non-member (walk_in_name)
 *  - court holds that belong to a bulletin event or a padel session, which
 *    have their own notifications
 *  - maintenance / blocked time
 *  - accounts that have been deleted
 *  - members holding more than MAX_DAILY_BOOKINGS_FOR_REMINDERS bookings at
 *    that club that day
 */
const CLAIM_DUE_BOOKINGS = `
  WITH due AS (
    SELECT b.id
      FROM bookings b
      JOIN facilities f ON f.id = b.facility_id
      JOIN users u ON u.id = b.user_id
     WHERE b.status = 'confirmed'
       AND b.reminder_sent_at IS NULL
       AND b.booking_date BETWEEN CURRENT_DATE - 1 AND CURRENT_DATE + 1
       AND b.walk_in_name IS NULL
       AND b.bulletin_post_id IS NULL
       AND b.padel_session_id IS NULL
       AND COALESCE(LOWER(b.booking_type), '') NOT IN ('maintenance', 'blocked')
       AND u.deleted_at IS NULL
       AND (
         SELECT COUNT(*) FROM bookings d
          WHERE d.user_id = b.user_id
            AND d.facility_id = b.facility_id
            AND d.booking_date = b.booking_date
            AND d.status = 'confirmed'
       ) <= $4
       AND ${START_AT} > NOW() + make_interval(mins => $1)
       AND ${START_AT} <= NOW() + make_interval(mins => $2)
       AND (b.created_at AT TIME ZONE 'UTC') <= ${START_AT} - make_interval(mins => $3)
     FOR UPDATE OF b SKIP LOCKED
  )
  UPDATE bookings b
     SET reminder_sent_at = CURRENT_TIMESTAMP
    FROM due, courts c, facilities f
   WHERE b.id = due.id
     AND c.id = b.court_id
     AND f.id = b.facility_id
  RETURNING
    b.id AS "bookingId",
    b.user_id AS "userId",
    b.facility_id AS "facilityId",
    b.court_id AS "courtId",
    to_char(b.booking_date, 'YYYY-MM-DD') AS "bookingDate",
    to_char(b.start_time, 'FMHH12:MI AM') AS "startTimeLabel",
    c.name AS "courtName",
    f.name AS "facilityName"`;

interface DueBooking {
  bookingId: string;
  userId: string;
  facilityId: string;
  courtId: string;
  bookingDate: string;
  startTimeLabel: string;
  courtName: string;
  facilityName: string;
}

/**
 * Sends every reminder that is due. Returns how many notifications went out.
 *
 * Someone holding several courts for the same start time (a coach, a team
 * captain) gets one reminder naming the count, not one per court.
 */
export async function sendDueBookingReminders(): Promise<number> {
  const result = await query(CLAIM_DUE_BOOKINGS, [
    REMINDER_MIN_LEAD_MINUTES,
    REMINDER_LEAD_MINUTES,
    SKIP_IF_BOOKED_WITHIN_MINUTES,
    MAX_DAILY_BOOKINGS_FOR_REMINDERS,
  ]);
  const due: DueBooking[] = result.rows;
  if (due.length === 0) return 0;

  const groups = new Map<string, DueBooking[]>();
  for (const booking of due) {
    const key = [booking.userId, booking.facilityId, booking.bookingDate, booking.startTimeLabel].join('|');
    const group = groups.get(key);
    if (group) group.push(booking);
    else groups.set(key, [booking]);
  }

  let sent = 0;
  for (const group of groups.values()) {
    const first = group[0]!;
    const what = group.length === 1 ? first.courtName : `${group.length} courts`;
    try {
      await notificationService.notifyBookingReminder(
        first.userId,
        first.facilityName,
        what,
        first.startTimeLabel,
        {
          bookingId: first.bookingId,
          facilityId: first.facilityId,
          bookingDate: first.bookingDate,
          courtId: first.courtId,
        }
      );
      sent++;
    } catch (error) {
      // The booking stays marked as reminded: a retry a minute later could
      // double-notify, and a missed reminder is the smaller harm.
      console.error('[BookingReminder] Failed to notify for booking', first.bookingId, error);
    }
  }
  return sent;
}
