/**
 * Facility-admin authorization helpers.
 *
 * The JWT (see middleware/auth.ts) proves *who* the caller is, not *what*
 * facility they may administer. Route handlers that mutate facility data must
 * additionally confirm the caller is an active admin of the specific facility
 * the request targets. These helpers centralize that check plus the resolvers
 * that map a sub-resource id (court, booking, series, …) back to its facility.
 */

import { Response } from 'express';
import { query } from '../../src/database/connection';
import { isFacilityAdmin } from '../../src/services/memberService';

/**
 * True when the user is a platform super admin (users.is_super_admin). A super
 * admin implicitly administers every facility, so this short-circuits all of
 * the per-facility admin checks below.
 */
export async function isPlatformSuperAdmin(
  userId: string | undefined | null
): Promise<boolean> {
  if (!userId) return false;
  const row = await query(
    `SELECT 1 FROM users WHERE id = $1 AND is_super_admin = true`,
    [userId]
  );
  return row.rows.length > 0;
}

/**
 * True when the user is an active admin of the facility, via either the
 * facility_admins table or the facility_memberships.is_facility_admin flag
 * (isFacilityAdmin covers the latter and the facility owner). Platform super
 * admins are treated as admins of every facility.
 */
export async function isFacilityAdminUser(
  facilityId: string | undefined | null,
  userId: string | undefined | null
): Promise<boolean> {
  if (!userId || !facilityId) return false;
  if (await isPlatformSuperAdmin(userId)) return true;
  const row = await query(
    `SELECT 1 FROM facility_admins
      WHERE facility_id = $1 AND user_id = $2 AND status = 'active'`,
    [facilityId, userId]
  );
  if (row.rows.length > 0) return true;
  return isFacilityAdmin(String(facilityId), String(userId));
}

/**
 * Guard for use inside a handler. Writes the appropriate error response and
 * returns false when the caller is not an admin of `facilityId`; returns true
 * (without touching `res`) when authorized.
 */
export async function ensureFacilityAdmin(
  facilityId: string | undefined | null,
  userId: string | undefined | null,
  res: Response
): Promise<boolean> {
  if (!userId) {
    res.status(401).json({ success: false, error: 'Authentication required' });
    return false;
  }
  if (!facilityId) {
    res.status(400).json({ success: false, error: 'facilityId is required' });
    return false;
  }
  if (!(await isFacilityAdminUser(facilityId, userId))) {
    res.status(403).json({ success: false, error: 'Facility admin access required' });
    return false;
  }
  return true;
}

// ── Sub-resource → facility resolvers ──────────────────────────────────────
// Each returns the owning facility id, or null when the resource does not exist.

export async function facilityIdForCourt(courtId: string): Promise<string | null> {
  const r = await query(`SELECT facility_id FROM courts WHERE id = $1`, [courtId]);
  return r.rows[0]?.facility_id ?? null;
}

export async function facilityIdForBooking(bookingId: string): Promise<string | null> {
  const r = await query(`SELECT facility_id FROM bookings WHERE id = $1`, [bookingId]);
  return r.rows[0]?.facility_id ?? null;
}

export async function facilityIdForSeries(seriesId: string): Promise<string | null> {
  const r = await query(`SELECT facility_id FROM booking_series WHERE id = $1`, [seriesId]);
  return r.rows[0]?.facility_id ?? null;
}

export async function facilityIdForAdminRecord(adminId: string): Promise<string | null> {
  const r = await query(`SELECT facility_id FROM facility_admins WHERE id = $1`, [adminId]);
  return r.rows[0]?.facility_id ?? null;
}

export async function facilityIdForBlackout(blackoutId: string): Promise<string | null> {
  const r = await query(`SELECT facility_id FROM court_blackouts WHERE id = $1`, [blackoutId]);
  return r.rows[0]?.facility_id ?? null;
}

export async function facilityIdForHousehold(householdId: string): Promise<string | null> {
  const r = await query(`SELECT facility_id FROM household_groups WHERE id = $1`, [householdId]);
  return r.rows[0]?.facility_id ?? null;
}

export async function facilityIdForStrike(strikeId: string): Promise<string | null> {
  const r = await query(`SELECT facility_id FROM account_strikes WHERE id = $1`, [strikeId]);
  return r.rows[0]?.facility_id ?? null;
}
