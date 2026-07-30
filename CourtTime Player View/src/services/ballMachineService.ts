/**
 * St. Marlow Ball Machine (st_marlow_ball_machine feature flag).
 *
 * Members reach the ball machine two ways:
 *   - a time-based pass (1/3/6/12 months, unlimited use) bought here, or
 *   - the per-hour rate that already lives on courts.ball_machine_fee_cents (migration 064).
 *
 * A live pass makes the hourly fee $0 for that booking. resolveBallMachineCoverage()
 * is the single place that decision is made; bookingService pins the result onto
 * bookings.ball_machine_pass_id so post-play settlement can't re-charge later.
 */

import { PoolClient } from 'pg';
import { query } from '../database/connection';

/** Pass lengths a club may offer, matching the CHECK on ball_machine_pass_products. */
export const PASS_DURATIONS_MONTHS = [1, 3, 6, 12] as const;
export type PassDurationMonths = (typeof PASS_DURATIONS_MONTHS)[number];

export interface BallMachineConfig {
  facilityId: string;
  accessCode: string | null;
  machineCount: number;
  instructions: string | null;
  updatedAt: string | null;
}

export interface BallMachinePassProduct {
  id: string;
  facilityId: string;
  durationMonths: number;
  priceCents: number;
  isActive: boolean;
}

export interface BallMachinePass {
  id: string;
  facilityId: string;
  userId: string;
  durationMonths: number;
  priceCentsAtPurchase: number;
  startsAt: string;
  expiresAt: string;
  status: 'pending' | 'active' | 'cancelled' | 'refunded';
  grantedBy: string | null;
  createdAt: string;
}

export interface BallMachinePassHolder extends BallMachinePass {
  fullName: string;
  email: string;
}

/** What booking needs to know: is this member's ball machine already paid for? */
export interface BallMachineCoverage {
  covered: boolean;
  passId: string | null;
}

const PASS_COLUMNS = `
  id,
  facility_id             AS "facilityId",
  user_id                 AS "userId",
  duration_months         AS "durationMonths",
  price_cents_at_purchase AS "priceCentsAtPurchase",
  starts_at               AS "startsAt",
  expires_at              AS "expiresAt",
  status,
  granted_by              AS "grantedBy",
  created_at              AS "createdAt"
`;

// ---------------------------------------------------------------------------
// Config (access code + machine count)
// ---------------------------------------------------------------------------

/** Never returns null — a facility with no row yet behaves as "1 machine, no code set". */
export async function getConfig(facilityId: string): Promise<BallMachineConfig> {
  const result = await query(
    `SELECT facility_id AS "facilityId",
            access_code AS "accessCode",
            machine_count AS "machineCount",
            instructions,
            updated_at AS "updatedAt"
       FROM ball_machine_config
      WHERE facility_id = $1`,
    [facilityId]
  );

  return (
    result.rows[0] ?? {
      facilityId,
      accessCode: null,
      machineCount: 1,
      instructions: null,
      updatedAt: null,
    }
  );
}

export async function upsertConfig(
  facilityId: string,
  updates: { accessCode?: string | null; machineCount?: number; instructions?: string | null },
  adminUserId: string
): Promise<BallMachineConfig> {
  const current = await getConfig(facilityId);

  const accessCode =
    updates.accessCode === undefined ? current.accessCode : normalizeAccessCode(updates.accessCode);
  const machineCount = updates.machineCount === undefined ? current.machineCount : updates.machineCount;
  const instructions =
    updates.instructions === undefined ? current.instructions : updates.instructions?.trim() || null;

  if (!Number.isInteger(machineCount) || machineCount < 1) {
    throw new Error('Machine count must be a whole number of at least 1');
  }

  await query(
    `INSERT INTO ball_machine_config (facility_id, access_code, machine_count, instructions, updated_at, updated_by)
     VALUES ($1, $2, $3, $4, NOW(), $5)
     ON CONFLICT (facility_id)
     DO UPDATE SET access_code = $2, machine_count = $3, instructions = $4, updated_at = NOW(), updated_by = $5`,
    [facilityId, accessCode, machineCount, instructions, adminUserId]
  );

  return getConfig(facilityId);
}

function normalizeAccessCode(code: string | null): string | null {
  const trimmed = code?.trim();
  if (!trimmed) return null;
  if (trimmed.length > 32) throw new Error('Access code must be 32 characters or fewer');
  return trimmed;
}

// ---------------------------------------------------------------------------
// Pass products (pricing)
// ---------------------------------------------------------------------------

export async function getPassProducts(
  facilityId: string,
  options?: { activeOnly?: boolean }
): Promise<BallMachinePassProduct[]> {
  const result = await query(
    `SELECT id,
            facility_id     AS "facilityId",
            duration_months AS "durationMonths",
            price_cents     AS "priceCents",
            is_active       AS "isActive"
       FROM ball_machine_pass_products
      WHERE facility_id = $1
        ${options?.activeOnly ? 'AND is_active = true' : ''}
      ORDER BY duration_months`,
    [facilityId]
  );
  return result.rows;
}

export async function upsertPassProduct(
  facilityId: string,
  durationMonths: number,
  priceCents: number,
  isActive: boolean
): Promise<void> {
  if (!PASS_DURATIONS_MONTHS.includes(durationMonths as PassDurationMonths)) {
    throw new Error(`Pass duration must be one of ${PASS_DURATIONS_MONTHS.join(', ')} months`);
  }
  if (!Number.isInteger(priceCents) || priceCents < 0) {
    throw new Error('Pass price must be a whole number of cents');
  }

  await query(
    `INSERT INTO ball_machine_pass_products (facility_id, duration_months, price_cents, is_active)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (facility_id, duration_months)
     DO UPDATE SET price_cents = $3, is_active = $4, updated_at = NOW()`,
    [facilityId, durationMonths, priceCents, isActive]
  );
}

export async function getActivePassProduct(
  facilityId: string,
  durationMonths: number
): Promise<BallMachinePassProduct | null> {
  const result = await query(
    `SELECT id,
            facility_id     AS "facilityId",
            duration_months AS "durationMonths",
            price_cents     AS "priceCents",
            is_active       AS "isActive"
       FROM ball_machine_pass_products
      WHERE facility_id = $1 AND duration_months = $2 AND is_active = true`,
    [facilityId, durationMonths]
  );
  return result.rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Passes
// ---------------------------------------------------------------------------

/** The member's live pass at this club, or null. Newest expiry wins when several overlap. */
export async function getActivePass(
  facilityId: string,
  userId: string
): Promise<BallMachinePass | null> {
  const result = await query(
    `SELECT ${PASS_COLUMNS}
       FROM ball_machine_passes
      WHERE facility_id = $1
        AND user_id = $2
        AND status = 'active'
        AND expires_at > NOW()
      ORDER BY expires_at DESC
      LIMIT 1`,
    [facilityId, userId]
  );
  return result.rows[0] ?? null;
}

export async function getMemberPasses(
  facilityId: string,
  userId: string
): Promise<BallMachinePass[]> {
  const result = await query(
    `SELECT ${PASS_COLUMNS}
       FROM ball_machine_passes
      WHERE facility_id = $1 AND user_id = $2 AND status != 'pending'
      ORDER BY created_at DESC`,
    [facilityId, userId]
  );
  return result.rows;
}

/** Every non-pending pass at the club, live ones first — the admin "who has access" table. */
export async function getPassHolders(facilityId: string): Promise<BallMachinePassHolder[]> {
  const result = await query(
    `SELECT p.id,
            p.facility_id             AS "facilityId",
            p.user_id                 AS "userId",
            p.duration_months         AS "durationMonths",
            p.price_cents_at_purchase AS "priceCentsAtPurchase",
            p.starts_at               AS "startsAt",
            p.expires_at              AS "expiresAt",
            p.status,
            p.granted_by              AS "grantedBy",
            p.created_at              AS "createdAt",
            u.full_name               AS "fullName",
            u.email
       FROM ball_machine_passes p
       JOIN users u ON u.id = p.user_id
      WHERE p.facility_id = $1
        AND p.status != 'pending'
      ORDER BY (p.status = 'active' AND p.expires_at > NOW()) DESC, p.expires_at DESC`,
    [facilityId]
  );
  return result.rows;
}

export function addMonths(from: Date, months: number): Date {
  const out = new Date(from.getTime());
  out.setMonth(out.getMonth() + months);
  return out;
}

/** Admin comps a pass — no charge, immediately active. */
export async function grantPass(params: {
  facilityId: string;
  userId: string;
  durationMonths: number;
  grantedBy: string;
}): Promise<BallMachinePass> {
  if (!Number.isInteger(params.durationMonths) || params.durationMonths < 1) {
    throw new Error('Pass duration must be a positive whole number of months');
  }

  const startsAt = new Date();
  const expiresAt = addMonths(startsAt, params.durationMonths);

  const result = await query(
    `INSERT INTO ball_machine_passes
       (facility_id, user_id, duration_months, price_cents_at_purchase,
        starts_at, expires_at, status, granted_by)
     VALUES ($1, $2, $3, 0, $4, $5, 'active', $6)
     RETURNING ${PASS_COLUMNS}`,
    [
      params.facilityId,
      params.userId,
      params.durationMonths,
      startsAt.toISOString(),
      expiresAt.toISOString(),
      params.grantedBy,
    ]
  );
  return result.rows[0];
}

/**
 * Ends a pass early. Bookings already made keep their ball_machine_pass_id, so a
 * revoked pass never retroactively bills someone for a session they already played.
 */
export async function revokePass(passId: string, facilityId: string): Promise<boolean> {
  const result = await query(
    `UPDATE ball_machine_passes
        SET status = 'cancelled'
      WHERE id = $1 AND facility_id = $2 AND status = 'active'
      RETURNING id`,
    [passId, facilityId]
  );
  return result.rows.length > 0;
}

// ---------------------------------------------------------------------------
// Booking-time coverage + machine availability
// ---------------------------------------------------------------------------

/**
 * The single decision point for "do we charge the hourly ball machine fee?".
 * Called by bookingService before it prices the booking.
 */
export async function resolveBallMachineCoverage(
  facilityId: string,
  userId: string,
  addBallMachine: boolean | undefined
): Promise<BallMachineCoverage> {
  if (!addBallMachine) return { covered: false, passId: null };

  const pass = await getActivePass(facilityId, userId);
  return pass ? { covered: true, passId: pass.id } : { covered: false, passId: null };
}

/**
 * How many other bookings already claim a machine in this window. The machine is a
 * club-wide resource, so this deliberately ignores court_id.
 *
 * Pass the transaction client when calling from inside createBooking so the count is
 * taken under the same lock that serializes the claim.
 */
export async function countOverlappingMachineClaims(
  params: {
    facilityId: string;
    bookingDate: string;
    startTime: string;
    endTime: string;
    excludeBookingId?: string;
  },
  client?: PoolClient
): Promise<number> {
  const run = client
    ? (text: string, values: any[]) => client.query(text, values)
    : (text: string, values: any[]) => query(text, values);

  const result = await run(
    `SELECT COUNT(*)::int AS count
       FROM bookings
      WHERE facility_id = $1
        AND booking_date = $2
        AND add_ball_machine = true
        AND status != 'cancelled'
        AND ($5::uuid IS NULL OR id != $5)
        AND start_time < $4::time
        AND end_time > $3::time`,
    [
      params.facilityId,
      params.bookingDate,
      params.startTime,
      params.endTime,
      params.excludeBookingId ?? null,
    ]
  );
  return result.rows[0]?.count ?? 0;
}

/**
 * Takes the facility-wide lock that serializes concurrent machine claims. The court-row
 * lock in createBooking only serializes per court, which isn't enough for a shared machine.
 */
export async function lockMachineConfig(
  facilityId: string,
  client: PoolClient
): Promise<{ machineCount: number }> {
  const result = await client.query(
    `SELECT machine_count AS "machineCount"
       FROM ball_machine_config
      WHERE facility_id = $1
      FOR UPDATE`,
    [facilityId]
  );

  // No config row yet: fall back to the default of a single machine. Nothing to lock,
  // but the court-row lock still bounds the race to one court at a time.
  return { machineCount: result.rows[0]?.machineCount ?? 1 };
}

// ---------------------------------------------------------------------------
// Access code authorization
// ---------------------------------------------------------------------------

/**
 * A member may see the code if they hold a live pass, or if they have an upcoming or
 * recent booking on which they claimed the machine (which means they already paid,
 * or their pass covered it).
 */
export async function canViewAccessCode(facilityId: string, userId: string): Promise<boolean> {
  const pass = await getActivePass(facilityId, userId);
  if (pass) return true;

  const result = await query(
    `SELECT 1
       FROM bookings
      WHERE facility_id = $1
        AND user_id = $2
        AND add_ball_machine = true
        AND status != 'cancelled'
        AND booking_date BETWEEN (CURRENT_DATE - INTERVAL '1 day') AND (CURRENT_DATE + INTERVAL '30 days')
      LIMIT 1`,
    [facilityId, userId]
  );
  return result.rows.length > 0;
}
