/**
 * Ball Machine (st_marlow_ball_machine feature flag).
 *
 * A facility can configure one or more named machines (e.g. "Tennis Ball Machine",
 * "Pickleball Ball Machine"), each with its own access code, instructions, hourly
 * rate, and pass pricing. Members reach a machine two ways:
 *   - a time-based pass (1/3/6/12 months, unlimited use) bought here, scoped to
 *     either one specific machine or "all machines" at the facility, or
 *   - the machine's own per-hour rate.
 *
 * A live pass makes the hourly fee $0 for that booking. resolveBallMachineCoverage()
 * is the single place that decision is made; bookingService pins the result onto
 * bookings.ball_machine_pass_id so post-play settlement can't re-charge later.
 *
 * Facilities that never configure a named machine (zero rows in ball_machine_machines)
 * keep behaving exactly as before this feature shipped: resolveSelectedMachine returns
 * null, and every caller falls back to the legacy facility-wide lock (lockMachineConfig)
 * and the per-court courts.ball_machine_fee_cents rate.
 */

import { PoolClient } from 'pg';
import { query } from '../database/connection';

/** Pass lengths a club may offer, matching the CHECK on ball_machine_pass_products. */
export const PASS_DURATIONS_MONTHS = [1, 3, 6, 12] as const;
export type PassDurationMonths = (typeof PASS_DURATIONS_MONTHS)[number];

export interface BallMachine {
  id: string;
  facilityId: string;
  name: string;
  accessCode: string | null;
  instructions: string | null;
  hourlyFeeCents: number | null;
  machineCount: number;
  isActive: boolean;
  sortOrder: number;
  updatedAt: string | null;
}

export interface BallMachinePassProduct {
  id: string;
  facilityId: string;
  machineId: string | null;
  durationMonths: number;
  priceCents: number;
  isActive: boolean;
}

export interface BallMachinePass {
  id: string;
  facilityId: string;
  machineId: string | null;
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
  machineName: string | null;
}

/** What booking needs to know: is this member's ball machine already paid for? */
export interface BallMachineCoverage {
  covered: boolean;
  passId: string | null;
}

const MACHINE_COLUMNS = `
  id,
  facility_id       AS "facilityId",
  name,
  access_code       AS "accessCode",
  instructions,
  hourly_fee_cents  AS "hourlyFeeCents",
  machine_count     AS "machineCount",
  is_active         AS "isActive",
  sort_order        AS "sortOrder",
  updated_at        AS "updatedAt"
`;

const PASS_COLUMNS = `
  id,
  facility_id             AS "facilityId",
  machine_id               AS "machineId",
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
// Machines
// ---------------------------------------------------------------------------

export async function listMachines(
  facilityId: string,
  options?: { activeOnly?: boolean }
): Promise<BallMachine[]> {
  const result = await query(
    `SELECT ${MACHINE_COLUMNS}
       FROM ball_machine_machines
      WHERE facility_id = $1
        ${options?.activeOnly ? 'AND is_active = true' : ''}
      ORDER BY sort_order, created_at`,
    [facilityId]
  );
  return result.rows;
}

export async function getMachine(facilityId: string, machineId: string): Promise<BallMachine | null> {
  const result = await query(
    `SELECT ${MACHINE_COLUMNS}
       FROM ball_machine_machines
      WHERE facility_id = $1 AND id = $2`,
    [facilityId, machineId]
  );
  return result.rows[0] ?? null;
}

export async function createMachine(
  facilityId: string,
  input: {
    name: string;
    accessCode?: string | null;
    instructions?: string | null;
    hourlyFeeCents?: number | null;
    machineCount?: number;
  },
  adminUserId: string
): Promise<BallMachine> {
  const name = input.name?.trim();
  if (!name) throw new Error('Machine name is required');

  const accessCode = normalizeAccessCode(input.accessCode ?? null);
  const instructions = input.instructions?.trim() || null;
  const hourlyFeeCents = normalizeHourlyFeeCents(input.hourlyFeeCents);
  const machineCount = input.machineCount ?? 1;
  if (!Number.isInteger(machineCount) || machineCount < 1) {
    throw new Error('Machine count must be a whole number of at least 1');
  }

  const maxSort = await query(
    `SELECT COALESCE(MAX(sort_order), -1) + 1 AS "nextSort" FROM ball_machine_machines WHERE facility_id = $1`,
    [facilityId]
  );
  const sortOrder = maxSort.rows[0]?.nextSort ?? 0;

  const result = await query(
    `INSERT INTO ball_machine_machines
       (facility_id, name, access_code, instructions, hourly_fee_cents, machine_count, is_active, sort_order, updated_at, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, true, $7, NOW(), $8)
     RETURNING ${MACHINE_COLUMNS}`,
    [facilityId, name, accessCode, instructions, hourlyFeeCents, machineCount, sortOrder, adminUserId]
  );
  return result.rows[0];
}

export async function updateMachine(
  facilityId: string,
  machineId: string,
  updates: {
    name?: string;
    accessCode?: string | null;
    instructions?: string | null;
    hourlyFeeCents?: number | null;
    machineCount?: number;
    isActive?: boolean;
  },
  adminUserId: string
): Promise<BallMachine> {
  const current = await getMachine(facilityId, machineId);
  if (!current) throw new Error('Machine not found');

  const name = updates.name === undefined ? current.name : updates.name.trim();
  if (!name) throw new Error('Machine name is required');
  const accessCode =
    updates.accessCode === undefined ? current.accessCode : normalizeAccessCode(updates.accessCode);
  const instructions =
    updates.instructions === undefined ? current.instructions : updates.instructions?.trim() || null;
  const hourlyFeeCents =
    updates.hourlyFeeCents === undefined ? current.hourlyFeeCents : normalizeHourlyFeeCents(updates.hourlyFeeCents);
  const machineCount = updates.machineCount === undefined ? current.machineCount : updates.machineCount;
  if (!Number.isInteger(machineCount) || machineCount < 1) {
    throw new Error('Machine count must be a whole number of at least 1');
  }
  const isActive = updates.isActive === undefined ? current.isActive : updates.isActive;

  const result = await query(
    `UPDATE ball_machine_machines
        SET name = $3, access_code = $4, instructions = $5, hourly_fee_cents = $6,
            machine_count = $7, is_active = $8, updated_at = NOW(), updated_by = $9
      WHERE facility_id = $1 AND id = $2
      RETURNING ${MACHINE_COLUMNS}`,
    [facilityId, machineId, name, accessCode, instructions, hourlyFeeCents, machineCount, isActive, adminUserId]
  );
  return result.rows[0];
}

/** Soft-delete only: bookings/passes/products may reference the machine historically. */
export async function deactivateMachine(facilityId: string, machineId: string, adminUserId: string): Promise<void> {
  await query(
    `UPDATE ball_machine_machines
        SET is_active = false, updated_at = NOW(), updated_by = $3
      WHERE facility_id = $1 AND id = $2`,
    [facilityId, machineId, adminUserId]
  );
}

export async function reorderMachines(
  facilityId: string,
  orderedMachineIds: string[],
  adminUserId: string
): Promise<void> {
  const existing = await listMachines(facilityId);
  const existingIds = new Set(existing.map((m) => m.id));
  if (
    orderedMachineIds.length !== existing.length ||
    !orderedMachineIds.every((id) => existingIds.has(id))
  ) {
    throw new Error('machineIds must include every machine at this facility exactly once');
  }

  await Promise.all(
    orderedMachineIds.map((id, index) =>
      query(
        `UPDATE ball_machine_machines SET sort_order = $3, updated_at = NOW(), updated_by = $4
          WHERE facility_id = $1 AND id = $2`,
        [facilityId, id, index, adminUserId]
      )
    )
  );
}

/**
 * The pivot point for every booking-time ball machine action: which physical
 * machine is actually being claimed.
 *
 *  - 0 active machines: the facility never adopted named machines. Returns null so
 *    callers fall back to the legacy per-court fee + facility-wide lock, unchanged.
 *  - 1 active machine: auto-selected regardless of what the client sent, so a
 *    single-machine facility's booking flow needs no picker and behaves exactly
 *    like the old singleton system.
 *  - 2+ active machines: the client must specify which one; it's validated to
 *    belong to this facility and be active.
 */
export async function resolveSelectedMachine(
  facilityId: string,
  requestedMachineId: string | null | undefined
): Promise<{ machine: BallMachine | null }> {
  const machines = await listMachines(facilityId, { activeOnly: true });
  if (machines.length === 0) return { machine: null };
  if (machines.length === 1) return { machine: machines[0] };

  if (!requestedMachineId) {
    throw new Error('Choose which ball machine to add');
  }
  const match = machines.find((m) => m.id === requestedMachineId);
  if (!match) {
    throw new Error('That ball machine is not available at this facility');
  }
  return { machine: match };
}

function normalizeAccessCode(code: string | null): string | null {
  const trimmed = code?.trim();
  if (!trimmed) return null;
  if (trimmed.length > 32) throw new Error('Access code must be 32 characters or fewer');
  return trimmed;
}

function normalizeHourlyFeeCents(cents: number | null | undefined): number | null {
  if (cents === null || cents === undefined) return null;
  if (!Number.isInteger(cents) || cents <= 0) {
    throw new Error('Hourly rate must be a positive whole number of cents, or null for no charge');
  }
  return cents;
}

// ---------------------------------------------------------------------------
// Pass products (pricing)
// ---------------------------------------------------------------------------

/**
 * `machineId` omitted = every product for the facility (admin "everything" view).
 * `machineId: null` = only all-machines products. A string = only that machine's.
 */
export async function getPassProducts(
  facilityId: string,
  options?: { activeOnly?: boolean; machineId?: string | null }
): Promise<BallMachinePassProduct[]> {
  const conditions = ['facility_id = $1'];
  const params: any[] = [facilityId];
  if (options?.activeOnly) conditions.push('is_active = true');
  if (options && 'machineId' in options) {
    if (options.machineId === null) {
      conditions.push('machine_id IS NULL');
    } else if (options.machineId) {
      params.push(options.machineId);
      conditions.push(`machine_id = $${params.length}`);
    }
  }

  const result = await query(
    `SELECT id,
            facility_id     AS "facilityId",
            machine_id      AS "machineId",
            duration_months AS "durationMonths",
            price_cents     AS "priceCents",
            is_active       AS "isActive"
       FROM ball_machine_pass_products
      WHERE ${conditions.join(' AND ')}
      ORDER BY machine_id NULLS FIRST, duration_months`,
    params
  );
  return result.rows;
}

/**
 * Two ON CONFLICT targets because Postgres needs a literal index expression to
 * infer the conflict target, and it can't dynamically pick between the two
 * partial unique indexes (migration 101) based on whether machineId is null.
 */
export async function upsertPassProduct(
  facilityId: string,
  machineId: string | null,
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

  if (machineId === null) {
    await query(
      `INSERT INTO ball_machine_pass_products (facility_id, machine_id, duration_months, price_cents, is_active)
       VALUES ($1, NULL, $2, $3, $4)
       ON CONFLICT (facility_id, duration_months) WHERE machine_id IS NULL
       DO UPDATE SET price_cents = $3, is_active = $4, updated_at = NOW()`,
      [facilityId, durationMonths, priceCents, isActive]
    );
  } else {
    await query(
      `INSERT INTO ball_machine_pass_products (facility_id, machine_id, duration_months, price_cents, is_active)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (facility_id, machine_id, duration_months) WHERE machine_id IS NOT NULL
       DO UPDATE SET price_cents = $4, is_active = $5, updated_at = NOW()`,
      [facilityId, machineId, durationMonths, priceCents, isActive]
    );
  }
}

export async function getActivePassProduct(
  facilityId: string,
  machineId: string | null,
  durationMonths: number
): Promise<BallMachinePassProduct | null> {
  const result = await query(
    `SELECT id,
            facility_id     AS "facilityId",
            machine_id      AS "machineId",
            duration_months AS "durationMonths",
            price_cents     AS "priceCents",
            is_active       AS "isActive"
       FROM ball_machine_pass_products
      WHERE facility_id = $1
        AND machine_id IS NOT DISTINCT FROM $2
        AND duration_months = $3
        AND is_active = true`,
    [facilityId, machineId, durationMonths]
  );
  return result.rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Passes
// ---------------------------------------------------------------------------

/** Every live pass the member holds at this club — an all-machines pass and a machine-specific one can coexist. */
export async function getActivePasses(facilityId: string, userId: string): Promise<BallMachinePass[]> {
  const result = await query(
    `SELECT ${PASS_COLUMNS}
       FROM ball_machine_passes
      WHERE facility_id = $1
        AND user_id = $2
        AND status = 'active'
        AND expires_at > NOW()
      ORDER BY expires_at DESC`,
    [facilityId, userId]
  );
  return result.rows;
}

/** The pass covering one specific machine: an exact match, or an all-machines pass. Exact match preferred. */
export async function getActivePassForMachine(
  facilityId: string,
  userId: string,
  machineId: string
): Promise<BallMachinePass | null> {
  const result = await query(
    `SELECT ${PASS_COLUMNS}
       FROM ball_machine_passes
      WHERE facility_id = $1
        AND user_id = $2
        AND status = 'active'
        AND expires_at > NOW()
        AND (machine_id = $3 OR machine_id IS NULL)
      ORDER BY (machine_id = $3) DESC, expires_at DESC
      LIMIT 1`,
    [facilityId, userId, machineId]
  );
  return result.rows[0] ?? null;
}

export async function getMemberPasses(facilityId: string, userId: string): Promise<BallMachinePass[]> {
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
            p.machine_id              AS "machineId",
            p.user_id                 AS "userId",
            p.duration_months         AS "durationMonths",
            p.price_cents_at_purchase AS "priceCentsAtPurchase",
            p.starts_at               AS "startsAt",
            p.expires_at              AS "expiresAt",
            p.status,
            p.granted_by              AS "grantedBy",
            p.created_at              AS "createdAt",
            u.full_name               AS "fullName",
            u.email,
            m.name                    AS "machineName"
       FROM ball_machine_passes p
       JOIN users u ON u.id = p.user_id
       LEFT JOIN ball_machine_machines m ON m.id = p.machine_id
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

/**
 * Admin comps a pass — no charge, immediately active.
 *
 * Extends the member's existing live pass in the SAME SCOPE rather than adding a
 * second row. An all-machines grant and a machine-specific grant are different
 * resources now, so "the member's active pass" must be looked up within the scope
 * being granted — otherwise this could silently extend the wrong pass.
 */
export async function grantPass(params: {
  facilityId: string;
  machineId: string | null;
  userId: string;
  durationMonths: number;
  grantedBy: string;
}): Promise<BallMachinePass> {
  if (!Number.isInteger(params.durationMonths) || params.durationMonths < 1) {
    throw new Error('Pass duration must be a positive whole number of months');
  }

  const existing = await query(
    `SELECT ${PASS_COLUMNS}
       FROM ball_machine_passes
      WHERE facility_id = $1
        AND user_id = $2
        AND machine_id IS NOT DISTINCT FROM $3
        AND status = 'active'
        AND expires_at > NOW()
      ORDER BY expires_at DESC
      LIMIT 1`,
    [params.facilityId, params.userId, params.machineId]
  );
  if (existing.rows[0]) {
    const extended = await query(
      `UPDATE ball_machine_passes
          SET expires_at = expires_at + ($2 * INTERVAL '1 month'),
              duration_months = duration_months + $2
        WHERE id = $1
        RETURNING ${PASS_COLUMNS}`,
      [existing.rows[0].id, params.durationMonths]
    );
    return extended.rows[0];
  }

  const startsAt = new Date();
  const expiresAt = addMonths(startsAt, params.durationMonths);

  const result = await query(
    `INSERT INTO ball_machine_passes
       (facility_id, machine_id, user_id, duration_months, price_cents_at_purchase,
        starts_at, expires_at, status, granted_by)
     VALUES ($1, $2, $3, $4, 0, $5, $6, 'active', $7)
     RETURNING ${PASS_COLUMNS}`,
    [
      params.facilityId,
      params.machineId,
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
 * Ends a member's ball machine access early, in one scope only.
 *
 * Cancels every live pass that member holds IN THE SAME SCOPE as the pass being
 * revoked (same exact machine, or same "all machines"), not just the row the admin
 * clicked — historically a member could end up with overlapping passes in one
 * scope, and cancelling one of them left them still covered in that scope. With
 * two scopes now legitimately coexisting, this must NOT blanket-cancel across
 * scopes: revoking an all-machines pass must never touch an unrelated
 * machine-specific pass, and vice versa.
 *
 * Bookings already made keep their ball_machine_pass_id, so revoking never
 * retroactively bills someone for a session they already played.
 */
export async function revokePass(
  passId: string,
  facilityId: string
): Promise<{ revoked: boolean; count: number }> {
  const target = await query(
    `SELECT user_id AS "userId", machine_id AS "machineId" FROM ball_machine_passes
      WHERE id = $1 AND facility_id = $2 AND status = 'active'`,
    [passId, facilityId]
  );
  if (target.rows.length === 0) return { revoked: false, count: 0 };
  const { userId, machineId } = target.rows[0];

  const result = await query(
    `UPDATE ball_machine_passes
        SET status = 'cancelled'
      WHERE facility_id = $1
        AND user_id = $2
        AND machine_id IS NOT DISTINCT FROM $3
        AND status = 'active'
        AND expires_at > NOW()
      RETURNING id`,
    [facilityId, userId, machineId]
  );
  return { revoked: true, count: result.rows.length };
}

// ---------------------------------------------------------------------------
// Booking-time coverage + machine availability
// ---------------------------------------------------------------------------

/**
 * The single decision point for "do we charge the hourly ball machine fee?".
 * Called by bookingService before it prices the booking.
 *
 * machineId is null only in the legacy zero-named-machines case, where passes
 * structurally can't exist for this facility (every facility that ever sold
 * passes has a seeded machine post-migration) — so coverage is always false there.
 */
export async function resolveBallMachineCoverage(
  facilityId: string,
  userId: string,
  machineId: string | null,
  addBallMachine: boolean | undefined
): Promise<BallMachineCoverage> {
  if (!addBallMachine || !machineId) return { covered: false, passId: null };

  const pass = await getActivePassForMachine(facilityId, userId, machineId);
  return pass ? { covered: true, passId: pass.id } : { covered: false, passId: null };
}

/**
 * How many other bookings already claim THIS machine in this window.
 *
 * Pass the transaction client when calling from inside createBooking so the count is
 * taken under the same lock that serializes the claim.
 */
export async function countOverlappingMachineClaimsForMachine(
  params: {
    facilityId: string;
    machineId: string;
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
        AND ball_machine_id = $2
        AND booking_date = $3
        AND add_ball_machine = true
        AND status != 'cancelled'
        AND ($6::uuid IS NULL OR id != $6)
        AND start_time < $5::time
        AND end_time > $4::time`,
    [
      params.facilityId,
      params.machineId,
      params.bookingDate,
      params.startTime,
      params.endTime,
      params.excludeBookingId ?? null,
    ]
  );
  return result.rows[0]?.count ?? 0;
}

/** Takes the row lock that serializes concurrent claims on one specific machine. */
export async function lockMachine(
  machineId: string,
  client: PoolClient
): Promise<{ machineCount: number }> {
  const result = await client.query(
    `SELECT machine_count AS "machineCount"
       FROM ball_machine_machines
      WHERE id = $1
      FOR UPDATE`,
    [machineId]
  );
  return { machineCount: result.rows[0]?.machineCount ?? 1 };
}

/**
 * How many other bookings already claim a machine in this window, for a facility
 * with zero named machines (legacy path only — kept byte-for-byte as it was before
 * multi-machine support, since this is what any never-migrated facility still uses).
 *
 * The machine is a club-wide resource, so this deliberately ignores court_id.
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
 * Takes the facility-wide lock that serializes concurrent machine claims for a
 * facility with zero named machines (legacy path). The court-row lock in
 * createBooking only serializes per court, which isn't enough for a shared machine.
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
 * A member may see one machine's code if they hold a pass covering it, or if they
 * have an upcoming or recent booking on which they claimed that exact machine
 * (which means they already paid, or their pass covered it).
 *
 * Bookings made in the transition window before this migration shipped have
 * ball_machine_id = NULL (not backfilled). For a facility with exactly one active
 * machine, that ambiguity is harmless — there's only one machine it could be — so
 * those legacy rows are also accepted as a claim on it. A facility that later adds
 * a second machine will be well past that transition window by the time it matters.
 */
export async function canViewAccessCode(
  facilityId: string,
  userId: string,
  machineId: string
): Promise<boolean> {
  const pass = await getActivePassForMachine(facilityId, userId, machineId);
  if (pass) return true;

  const activeMachines = await listMachines(facilityId, { activeOnly: true });
  const isOnlyMachine = activeMachines.length === 1 && activeMachines[0].id === machineId;

  const result = await query(
    `SELECT 1
       FROM bookings
      WHERE facility_id = $1
        AND user_id = $2
        AND add_ball_machine = true
        AND status != 'cancelled'
        AND (ball_machine_id = $3 OR ($4::boolean AND ball_machine_id IS NULL))
        AND booking_date BETWEEN (CURRENT_DATE - INTERVAL '1 day') AND (CURRENT_DATE + INTERVAL '30 days')
      LIMIT 1`,
    [facilityId, userId, machineId, isOnlyMachine]
  );
  return result.rows.length > 0;
}
