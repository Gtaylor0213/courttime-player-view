/**
 * Add-to-calendar links for booking emails (Glen Abbey Pickleball Gate Code flag).
 *
 * An email link can't carry a login, so the .ics link is signed per booking and
 * member. It serves only that booking, and only while it is confirmed.
 */

import { createHmac, timingSafeEqual } from 'crypto';
import { query } from '../database/connection';
import { EMAIL_SITE_URL } from '../../shared/utils/brandedEmail';
import {
  bookingWithDetailsToCalendarDetails,
  buildGoogleCalendarUrl,
  type BookingCalendarDetails,
} from '../../shared/utils/bookingCalendar';
import { getActiveGateCode } from './gateCodeService';
import { buildCalendarButtonsHtml } from './emailTemplateDefaults';

export function signBookingCalendarToken(bookingId: string, userId: string): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is required to sign calendar links');
  return createHmac('sha256', secret).update(`booking-calendar:${bookingId}:${userId}`).digest('base64url');
}

export function verifyBookingCalendarToken(bookingId: string, userId: string, token: string): boolean {
  const expected = Buffer.from(signBookingCalendarToken(bookingId, userId));
  const actual = Buffer.from(token);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export interface BookingCalendarLinkData {
  userId: string;
  timeZone: string;
  details: BookingCalendarDetails;
}

/** The confirmed booking's calendar event, including the current gate code. */
export async function loadBookingCalendarLinkData(bookingId: string): Promise<BookingCalendarLinkData | null> {
  const result = await query(
    `SELECT b.user_id AS "userId", b.facility_id AS "facilityId",
            TO_CHAR(b.booking_date, 'YYYY-MM-DD') AS "bookingDate",
            b.start_time AS "startTime", b.end_time AS "endTime",
            b.booking_type AS "bookingType", b.notes,
            c.name AS "courtName", f.name AS "facilityName",
            COALESCE(NULLIF(f.timezone, ''), 'America/New_York') AS "timeZone"
       FROM bookings b
       JOIN courts c ON c.id = b.court_id
       JOIN facilities f ON f.id = b.facility_id
      WHERE b.id = $1 AND b.status = 'confirmed'`,
    [bookingId]
  );
  const row = result.rows[0];
  if (!row) return null;
  const gateCode = await getActiveGateCode(row.facilityId);
  return {
    userId: row.userId,
    timeZone: row.timeZone,
    details: bookingWithDetailsToCalendarDetails({
      courtName: row.courtName,
      facilityName: row.facilityName,
      bookingDate: row.bookingDate,
      startTime: row.startTime,
      endTime: row.endTime,
      bookingType: row.bookingType ?? undefined,
      notes: row.notes ?? undefined,
      gateCode,
    }),
  };
}

/** Google + Apple/Outlook buttons for an email; empty if the links can't be built. */
export async function buildBookingCalendarButtons(bookingId: string): Promise<string> {
  try {
    const data = await loadBookingCalendarLinkData(bookingId);
    if (!data) return '';
    const token = signBookingCalendarToken(bookingId, data.userId);
    return buildCalendarButtonsHtml(
      buildGoogleCalendarUrl(data.details, { timeZone: data.timeZone }),
      `${EMAIL_SITE_URL}/api/booking-calendar/${encodeURIComponent(bookingId)}/${token}/calendar.ics`
    );
  } catch (error) {
    console.error('Error building booking calendar links:', error);
    return '';
  }
}
