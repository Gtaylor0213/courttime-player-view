/**
 * Reading and editing recurring reservations as a series.
 *
 * A series is its rule (booking_series) plus its instances (bookings rows
 * carrying series_id). Editing means: diff the edited rule against the
 * instances, then apply the resulting plan inside one transaction so the
 * series can never be left half-moved.
 *
 * Scopes mirror what the calendar offers:
 *   instance  - one booking; the rule is untouched and that date drifts.
 *   following - this date onward; the original series is truncated and the
 *               tail becomes its own series, so both halves stay editable.
 *   all       - every instance the rule covers.
 *
 * Removals are real cancellations (status = 'cancelled' + notification +
 * email), not row deletes -- the old admin endpoints hard-deleted, which lost
 * the member's history and told them nothing. They do not issue late-cancel
 * strikes: reshaping a series is an administrative act, not a member bailing
 * on a court, and striking someone once per removed date would be absurd.
 */
import { query, transaction } from '../database/connection';
import type { PoolClient } from 'pg';
import { validateBooking, type RecurringSeriesConflict } from './bookingService';
import { isFacilityAdmin as isFacilityAdminBroad } from './memberService';
import { notificationService } from './notificationService';
import { sendBookingCancellationEmail } from './emailService';
import {
  normalizeWeekdays,
  parseYmd,
  toYmd,
  type RecurrenceRule,
} from '../../shared/utils/recurrence';
import {
  reconcileSeries,
  type ReconcilePlan,
  type SeriesInstance,
} from './bookingSeriesReconcile';
import type { RuleResult } from './rulesEngine';

export type SeriesScope = 'instance' | 'following' | 'all';

/** Everything the create form collects, which is everything the edit form offers. */
export interface SeriesRule extends RecurrenceRule {
  userId: string;
  walkInName?: string | null;
  bookingType?: string | null;
  notes?: string | null;
  maxPlayers?: number | null;
}

export interface SeriesDetail {
  id: string;
  facilityId: string;
  createdBy: string;
  status: 'active' | 'cancelled';
  rule: SeriesRule;
  ownerName?: string | null;
  bookedByStaffId?: string | null;
  instances: Array<SeriesInstance & { courtName?: string }>;
}

export interface SeriesWriteResult {
  success: boolean;
  error?: string;
  seriesId?: string;
  /** Set when 'following' split the series and the tail got a new id. */
  newSeriesId?: string;
  created?: number;
  updated?: number;
  cancelled?: number;
  /** Instances in the past that the edit deliberately left alone. */
  skippedPast?: number;
  /** Populated on a 409 so the caller can offer "apply to the rest anyway". */
  conflicts?: RecurringSeriesConflict[];
  ruleViolations?: RuleResult[];
  warnings?: RuleResult[];
}

/** Thrown inside the transaction to roll back a partially-applied edit. */
class SeriesConflictError extends Error {
  constructor(public conflicts: RecurringSeriesConflict[]) {
    super('Series edit conflicts with existing reservations');
    this.name = 'SeriesConflictError';
  }
}

function todayYmd(): string {
  return toYmd(new Date());
}

function dayBefore(ymd: string): string {
  const date = parseYmd(ymd);
  if (!date) return ymd;
  date.setDate(date.getDate() - 1);
  return toYmd(date);
}

/** Postgres TIME comes back as `18:00:00`; tolerate `18:00` from clients. */
function withSeconds(value: string): string {
  const match = String(value ?? '').match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return String(value ?? '');
  const [, h, m, s] = match;
  return `${h.padStart(2, '0')}:${m}:${s ?? '00'}`;
}

const SERIES_COLUMNS = `
  s.id,
  s.facility_id as "facilityId",
  s.created_by as "createdBy",
  s.user_id as "userId",
  s.booked_by_staff_id as "bookedByStaffId",
  s.walk_in_name as "walkInName",
  s.court_ids as "courtIds",
  s.weekdays,
  TO_CHAR(s.start_date, 'YYYY-MM-DD') as "startDate",
  TO_CHAR(s.end_date, 'YYYY-MM-DD') as "endDate",
  s.start_time as "startTime",
  s.end_time as "endTime",
  s.duration_minutes as "durationMinutes",
  s.booking_type as "bookingType",
  s.notes,
  s.max_players as "maxPlayers",
  s.status
`;

function rowToRule(row: any): SeriesRule {
  return {
    userId: row.userId,
    courtIds: (row.courtIds || []).map(String),
    weekdays: normalizeWeekdays(row.weekdays || []),
    startDate: row.startDate,
    endDate: row.endDate,
    startTime: withSeconds(row.startTime),
    endTime: withSeconds(row.endTime),
    durationMinutes: Number(row.durationMinutes),
    walkInName: row.walkInName,
    bookingType: row.bookingType,
    notes: row.notes,
    maxPlayers: row.maxPlayers == null ? null : Number(row.maxPlayers),
  };
}

/** The series rule plus every instance, for the edit form to open with. */
export async function getBookingSeries(seriesId: string): Promise<SeriesDetail | null> {
  const seriesResult = await query(
    `SELECT ${SERIES_COLUMNS}, u.full_name as "ownerName"
     FROM booking_series s
     LEFT JOIN users u ON u.id = s.user_id
     WHERE s.id = $1`,
    [seriesId]
  );
  if (seriesResult.rows.length === 0) return null;
  const row = seriesResult.rows[0];

  const instancesResult = await query(
    `SELECT
       b.id,
       b.court_id as "courtId",
       TO_CHAR(b.booking_date, 'YYYY-MM-DD') as "bookingDate",
       b.start_time as "startTime",
       b.end_time as "endTime",
       b.duration_minutes as "durationMinutes",
       b.status,
       c.name as "courtName"
     FROM bookings b
     JOIN courts c ON c.id = b.court_id
     WHERE b.series_id = $1
     ORDER BY b.booking_date, b.start_time, c.name`,
    [seriesId]
  );

  return {
    id: row.id,
    facilityId: row.facilityId,
    createdBy: row.createdBy,
    status: row.status,
    ownerName: row.ownerName,
    bookedByStaffId: row.bookedByStaffId,
    rule: rowToRule(row),
    instances: instancesResult.rows.map((i: any) => ({
      ...i,
      startTime: withSeconds(i.startTime),
      endTime: withSeconds(i.endTime),
      durationMinutes: Number(i.durationMinutes),
    })),
  };
}

/**
 * Owner, facility admin, or the staff member who booked it. Mirrors
 * cancelBooking's broad admin definition so an owner-admin whose access lives
 * on the membership row is not locked out of their own facility's series.
 */
export async function canManageSeries(
  series: SeriesDetail,
  actorUserId: string
): Promise<boolean> {
  if (series.rule.userId === actorUserId) return true;
  if (series.createdBy === actorUserId) return true;
  return isFacilityAdminBroad(series.facilityId, actorUserId);
}

async function courtNameMap(client: PoolClient, courtIds: string[]) {
  if (courtIds.length === 0) return new Map<string, string>();
  const rows = await client.query(
    `SELECT id, name FROM courts WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE`,
    [courtIds]
  );
  return new Map<string, string>(
    rows.rows.map((r: { id: string; name: string }) => [r.id, r.name])
  );
}

/** Overlap + split-court check for one slot, inside the edit's transaction. */
async function slotIsFree(
  client: PoolClient,
  courtId: string,
  bookingDate: string,
  startTime: string,
  endTime: string,
  excludeBookingId?: string
): Promise<boolean> {
  const overlap = await client.query(
    `SELECT id FROM bookings
     WHERE court_id = $1 AND booking_date = $2 AND status != 'cancelled'
       AND ($5::uuid IS NULL OR id != $5::uuid)
       AND (
         (start_time <= $3 AND end_time > $3)
         OR (start_time < $4 AND end_time >= $4)
         OR (start_time >= $3 AND end_time <= $4)
       )`,
    [courtId, bookingDate, startTime, endTime, excludeBookingId || null]
  );
  if (overlap.rows.length > 0) return false;

  const split = await client.query(
    `SELECT check_split_court_availability($1, $2::date, $3::time, $4::time) as available`,
    [courtId, bookingDate, startTime, endTime]
  );
  return Boolean(split.rows[0]?.available);
}

/**
 * Reshape only the named bookings, leaving the rule and every other date alone.
 *
 * One selected date may also move to another date (the person picked a new one
 * in the form); several selected dates each keep their own date, since a single
 * target date cannot describe all of them.
 */
function planForInstances(
  instances: SeriesDetail['instances'],
  bookingIds: string[],
  rule: SeriesRule
): ReconcilePlan {
  const wanted = new Set(bookingIds);
  const selected = instances.filter((i) => wanted.has(i.id) && i.status !== 'cancelled');
  const singleDate = selected.length === 1 ? rule.startDate : null;

  return {
    keep: [],
    reshape: selected.map((booking) => ({
      booking,
      to: {
        // Keep the booking on its own court when that court is still in the
        // selection, so editing several dates at once does not pile them up.
        courtId: rule.courtIds.includes(booking.courtId) ? booking.courtId : rule.courtIds[0],
        bookingDate: singleDate || booking.bookingDate,
        startTime: rule.startTime,
        endTime: rule.endTime,
        durationMinutes: rule.durationMinutes,
      },
    })),
    create: [],
    cancel: [],
    untouchedPast: [],
  };
}

export interface UpdateSeriesInput {
  seriesId: string;
  actorUserId: string;
  scope: SeriesScope;
  /** Required for 'following' and 'instance': the date/booking the person clicked. */
  fromDate?: string;
  bookingIds?: string[];
  /** The edited rule and its metadata. Every field the create form offers. */
  rule: SeriesRule;
  /** Dates unchecked in the date list. */
  excludeDates?: string[];
  /** Apply to the non-conflicting dates and skip the rest. */
  skipConflicts?: boolean;
  /** Staff bypass booking rules, as they do everywhere else. */
  skipRulesValidation?: boolean;
  /** Let the edit rewrite instances that already happened. */
  includePast?: boolean;
}

export async function updateBookingSeries(
  input: UpdateSeriesInput
): Promise<SeriesWriteResult> {
  const series = await getBookingSeries(input.seriesId);
  if (!series) return { success: false, error: 'Recurring reservation not found' };
  if (!(await canManageSeries(series, input.actorUserId))) {
    return { success: false, error: 'Not authorized to edit this recurring reservation' };
  }

  const rule: SeriesRule = {
    ...input.rule,
    startTime: withSeconds(input.rule.startTime),
    endTime: withSeconds(input.rule.endTime),
    weekdays: normalizeWeekdays(input.rule.weekdays),
    courtIds: [...new Set(input.rule.courtIds.filter(Boolean))],
  };

  if (rule.courtIds.length === 0) {
    return { success: false, error: 'Select at least one court' };
  }
  if (rule.weekdays.length === 0) {
    return { success: false, error: 'Select at least one day of the week' };
  }
  if (!parseYmd(rule.startDate) || !parseYmd(rule.endDate)) {
    return { success: false, error: 'Start and end dates must be valid dates' };
  }
  if (rule.endDate < rule.startDate) {
    return { success: false, error: 'End date must be on or after the start date' };
  }
  if (!(rule.durationMinutes > 0)) {
    return { success: false, error: 'Duration must be greater than zero' };
  }

  const today = todayYmd();
  const fromDate = input.scope === 'following' ? input.fromDate : undefined;
  if (input.scope === 'following' && !fromDate) {
    return { success: false, error: 'A start date is required to edit this and later dates' };
  }
  if (input.scope === 'instance' && !input.bookingIds?.length) {
    return { success: false, error: 'Select at least one date to edit' };
  }

  // Editing single dates is not a rule change: the chosen bookings are reshaped
  // and the series rule is left exactly as it was, so those dates simply drift
  // from it. Reconciling here instead would read the one-off edit as a new rule
  // and cancel every date it did not cover.
  const plan: ReconcilePlan =
    input.scope === 'instance'
      ? planForInstances(series.instances, input.bookingIds || [], rule)
      : reconcileSeries({
          instances: series.instances,
          rule,
          fromDate,
          excludeDates: input.excludeDates,
          today,
          includePast: input.includePast,
        });

  if (input.scope === 'instance' && plan.reshape.length === 0) {
    return { success: false, error: 'Those dates are not part of this recurring reservation' };
  }

  // Booking rules run outside the transaction, as they do on create: they are
  // quota questions, not slot questions. A reshape passes its own id so the
  // booking it replaces is not counted against the member twice.
  const warnings: RuleResult[] = [];
  if (!input.skipRulesValidation) {
    const blockers: RuleResult[] = [];
    const toValidate = [
      ...plan.create.map((c) => ({ occ: c, excludeBookingId: undefined as string | undefined })),
      ...plan.reshape.map((r) => ({ occ: r.to, excludeBookingId: r.booking.id })),
    ];
    for (const { occ, excludeBookingId } of toValidate) {
      const validation = await validateBooking({
        courtId: occ.courtId,
        userId: rule.userId,
        facilityId: series.facilityId,
        bookingDate: occ.bookingDate,
        startTime: occ.startTime,
        endTime: occ.endTime,
        durationMinutes: occ.durationMinutes,
        bookingType: rule.bookingType || undefined,
        excludeBookingId,
      });
      if (!validation.allowed) blockers.push(...validation.blockers);
      if (validation.warnings?.length) warnings.push(...validation.warnings);
    }
    if (blockers.length > 0) {
      return {
        success: false,
        error: blockers[0]?.message || 'This change fails the facility booking rules',
        ruleViolations: blockers,
        warnings,
      };
    }
  }

  let cancelledForNotice: Array<{ id: string; userId: string; courtId: string; bookingDate: string; startTime: string }> = [];

  try {
    const result = await transaction(async (client) => {
      const allCourtIds = [
        ...new Set([
          ...rule.courtIds,
          ...series.instances.map((i) => i.courtId),
        ]),
      ].sort();
      const courtNames = await courtNameMap(client, allCourtIds);

      // Freeing slots first means a same-series move (Mon 6pm -> Mon 7pm, or
      // court A -> court B on the same date) does not conflict with itself.
      if (plan.cancel.length > 0) {
        const ids = plan.cancel.map((c) => c.id);
        const cancelled = await client.query(
          `UPDATE bookings
           SET status = 'cancelled',
               settlement_status = CASE
                 WHEN settlement_status IN ('unsettled', 'settling') THEN 'cancelled_unpaid'
                 ELSE settlement_status
               END,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ANY($1::uuid[])
           RETURNING id, user_id as "userId", court_id as "courtId",
                     TO_CHAR(booking_date, 'YYYY-MM-DD') as "bookingDate",
                     start_time as "startTime"`,
          [ids]
        );
        cancelledForNotice = cancelled.rows;
      }

      const conflicts: RecurringSeriesConflict[] = [];
      const applicableReshape: typeof plan.reshape = [];
      const applicableCreate: typeof plan.create = [];

      for (const action of plan.reshape) {
        const free = await slotIsFree(
          client,
          action.to.courtId,
          action.to.bookingDate,
          action.to.startTime,
          action.to.endTime,
          action.booking.id
        );
        if (free) applicableReshape.push(action);
        else
          conflicts.push({
            courtId: action.to.courtId,
            courtName: courtNames.get(action.to.courtId) || 'Court',
            bookingDate: action.to.bookingDate,
            startTime: action.to.startTime,
            endTime: action.to.endTime,
          });
      }

      for (const occ of plan.create) {
        const free = await slotIsFree(
          client,
          occ.courtId,
          occ.bookingDate,
          occ.startTime,
          occ.endTime
        );
        if (free) applicableCreate.push(occ);
        else
          conflicts.push({
            courtId: occ.courtId,
            courtName: courtNames.get(occ.courtId) || 'Court',
            bookingDate: occ.bookingDate,
            startTime: occ.startTime,
            endTime: occ.endTime,
          });
      }

      if (conflicts.length > 0 && !input.skipConflicts) {
        // Rolls back the cancellations above: nothing is applied, and the
        // caller can show the full conflict list and re-submit with skip.
        throw new SeriesConflictError(conflicts);
      }

      for (const action of applicableReshape) {
        await client.query(
          `UPDATE bookings
           SET court_id = $2, booking_date = $3, start_time = $4, end_time = $5,
               duration_minutes = $6, booking_type = $7, notes = $8,
               max_players = $9, walk_in_name = $10, updated_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [
            action.booking.id,
            action.to.courtId,
            action.to.bookingDate,
            action.to.startTime,
            action.to.endTime,
            action.to.durationMinutes,
            rule.bookingType || null,
            rule.notes || null,
            rule.maxPlayers ?? null,
            rule.walkInName || null,
          ]
        );
      }

      // 'following' splits the series so the earlier dates keep their own rule.
      let targetSeriesId = series.id;
      let newSeriesId: string | undefined;
      if (input.scope === 'following' && fromDate) {
        const tail = await client.query(
          `INSERT INTO booking_series (
             facility_id, created_by, user_id, booked_by_staff_id, walk_in_name,
             title, notes, court_ids, weekdays, start_date, end_date,
             start_time, end_time, duration_minutes, booking_type, max_players, status
           )
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8::uuid[],$9::smallint[],$10,$11,$12,$13,$14,$15,$16,'active')
           RETURNING id`,
          [
            series.facilityId,
            input.actorUserId,
            rule.userId,
            series.bookedByStaffId || null,
            rule.walkInName || null,
            null,
            rule.notes || null,
            rule.courtIds,
            rule.weekdays,
            fromDate > rule.startDate ? fromDate : rule.startDate,
            rule.endDate,
            rule.startTime,
            rule.endTime,
            rule.durationMinutes,
            rule.bookingType || null,
            rule.maxPlayers ?? null,
          ]
        );
        newSeriesId = tail.rows[0].id as string;
        targetSeriesId = newSeriesId;

        // Move the tail's surviving instances onto the new series, and stop the
        // original rule the day before the split.
        await client.query(
          `UPDATE bookings SET series_id = $1, updated_at = CURRENT_TIMESTAMP
           WHERE series_id = $2 AND booking_date >= $3 AND status != 'cancelled'`,
          [newSeriesId, series.id, fromDate]
        );
        await client.query(
          `UPDATE booking_series SET end_date = $2, updated_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [series.id, dayBefore(fromDate)]
        );
      } else if (input.scope !== 'instance') {
        await client.query(
          `UPDATE booking_series
           SET user_id = $2, walk_in_name = $3, court_ids = $4::uuid[],
               weekdays = $5::smallint[], start_date = $6, end_date = $7,
               start_time = $8, end_time = $9, duration_minutes = $10,
               booking_type = $11, notes = $12, max_players = $13,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [
            series.id,
            rule.userId,
            rule.walkInName || null,
            rule.courtIds,
            rule.weekdays,
            rule.startDate,
            rule.endDate,
            rule.startTime,
            rule.endTime,
            rule.durationMinutes,
            rule.bookingType || null,
            rule.notes || null,
            rule.maxPlayers ?? null,
          ]
        );
      }

      for (const occ of applicableCreate) {
        await client.query(
          `INSERT INTO bookings (
             series_id, court_id, user_id, facility_id, booking_date,
             start_time, end_time, duration_minutes, booking_type, notes,
             status, is_prime_time, booked_by_staff_id, walk_in_name, max_players
           )
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'confirmed',false,$11,$12,$13)`,
          [
            targetSeriesId,
            occ.courtId,
            rule.userId,
            series.facilityId,
            occ.bookingDate,
            occ.startTime,
            occ.endTime,
            occ.durationMinutes,
            rule.bookingType || null,
            rule.notes || null,
            series.bookedByStaffId || null,
            rule.walkInName || null,
            rule.maxPlayers ?? null,
          ]
        );
      }

      // A series with nothing live left is closed out rather than left dangling.
      await closeOutEmptySeries(client, series.id);

      return {
        newSeriesId,
        created: applicableCreate.length,
        updated: applicableReshape.length,
        cancelled: plan.cancel.length,
        skippedConflicts: conflicts.length,
      };
    });

    await notifyCancelledInstances(cancelledForNotice, series.facilityId);

    return {
      success: true,
      seriesId: series.id,
      newSeriesId: result.newSeriesId,
      created: result.created,
      updated: result.updated,
      cancelled: result.cancelled,
      skippedPast: plan.untouchedPast.length,
      warnings,
    };
  } catch (error) {
    if (error instanceof SeriesConflictError) {
      return {
        success: false,
        error:
          'Some dates in this recurring reservation conflict with existing reservations. Nothing was changed.',
        conflicts: error.conflicts,
        warnings,
      };
    }
    console.error('Error updating booking series:', error);
    return { success: false, error: 'Failed to update the recurring reservation' };
  }
}

export interface CancelSeriesInput {
  seriesId: string;
  actorUserId: string;
  scope: SeriesScope;
  fromDate?: string;
  bookingIds?: string[];
  reason?: string;
  includePast?: boolean;
}

export async function cancelBookingSeries(
  input: CancelSeriesInput
): Promise<SeriesWriteResult> {
  const series = await getBookingSeries(input.seriesId);
  if (!series) return { success: false, error: 'Recurring reservation not found' };
  if (!(await canManageSeries(series, input.actorUserId))) {
    return { success: false, error: 'Not authorized to cancel this recurring reservation' };
  }

  const today = todayYmd();
  const live = series.instances.filter((i) => i.status !== 'cancelled');
  const selected = new Set(input.bookingIds || []);

  const targets = live.filter((i) => {
    if (!input.includePast && i.bookingDate < today) return false;
    if (input.scope === 'instance') return selected.has(i.id);
    if (input.scope === 'following') return !!input.fromDate && i.bookingDate >= input.fromDate;
    return true;
  });

  if (input.scope === 'instance' && targets.length === 0) {
    return { success: false, error: 'Select at least one date to cancel' };
  }
  if (targets.length === 0) {
    return { success: false, error: 'There are no upcoming dates left to cancel' };
  }

  try {
    const cancelled = await transaction(async (client) => {
      const rows = await client.query(
        `UPDATE bookings
         SET status = 'cancelled',
             settlement_status = CASE
               WHEN settlement_status IN ('unsettled', 'settling') THEN 'cancelled_unpaid'
               ELSE settlement_status
             END,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ANY($1::uuid[]) AND status != 'cancelled'
         RETURNING id, user_id as "userId", court_id as "courtId",
                   TO_CHAR(booking_date, 'YYYY-MM-DD') as "bookingDate",
                   start_time as "startTime"`,
        [targets.map((t) => t.id)]
      );

      if (input.scope === 'following' && input.fromDate) {
        // The rule stops where the cancellation starts, so the remaining dates
        // keep describing themselves correctly.
        await client.query(
          `UPDATE booking_series SET end_date = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
          [series.id, dayBefore(input.fromDate)]
        );
      }

      await closeOutEmptySeries(client, series.id);
      return rows.rows;
    });

    await notifyCancelledInstances(cancelled, series.facilityId, input.reason);

    return { success: true, seriesId: series.id, cancelled: cancelled.length };
  } catch (error) {
    console.error('Error cancelling booking series:', error);
    return { success: false, error: 'Failed to cancel the recurring reservation' };
  }
}

/** Mark a series cancelled once no live instance is left. */
async function closeOutEmptySeries(client: PoolClient, seriesId: string): Promise<void> {
  await client.query(
    `UPDATE booking_series s
     SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
     WHERE s.id = $1
       AND s.status = 'active'
       AND NOT EXISTS (
         SELECT 1 FROM bookings b WHERE b.series_id = s.id AND b.status != 'cancelled'
       )`,
    [seriesId]
  );
}

/**
 * Tell the member which dates went away. Fired after commit and never allowed
 * to fail the edit -- a bounced email must not undo a correct schedule change.
 */
async function notifyCancelledInstances(
  rows: Array<{ id: string; userId: string; courtId: string; bookingDate: string; startTime: string }>,
  facilityId: string,
  reason?: string
): Promise<void> {
  if (rows.length === 0) return;
  try {
    const facility = await query('SELECT name FROM facilities WHERE id = $1', [facilityId]);
    const facilityName = facility.rows[0]?.name || 'Your facility';
    const courtIds = [...new Set(rows.map((r) => r.courtId))];
    const courts = await query('SELECT id, name FROM courts WHERE id = ANY($1::uuid[])', [courtIds]);
    const courtNames = new Map<string, string>(
      courts.rows.map((c: { id: string; name: string }) => [c.id, c.name])
    );
    const userIds = [...new Set(rows.map((r) => r.userId))];
    const users = await query(
      'SELECT id, email, full_name as "fullName" FROM users WHERE id = ANY($1::uuid[])',
      [userIds]
    );
    const userById = new Map<string, { email: string; fullName: string }>(
      users.rows.map((u: any) => [u.id, { email: u.email, fullName: u.fullName }])
    );
    const why = reason || 'Recurring reservation updated';

    for (const row of rows) {
      const courtName = courtNames.get(row.courtId) || 'Court';
      const startDateTime = new Date(`${row.bookingDate}T${withSeconds(row.startTime)}`);
      await notificationService.notifyBookingCancelled(
        row.userId,
        facilityName,
        courtName,
        startDateTime,
        why,
        { bookingId: row.id, facilityId, bookingDate: row.bookingDate }
      );

      const user = userById.get(row.userId);
      if (!user?.email) continue;
      const dateFormatted = startDateTime.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });
      const startFormatted = startDateTime.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      });
      void sendBookingCancellationEmail(
        user.email,
        user.fullName,
        facilityId,
        facilityName,
        courtName,
        dateFormatted,
        startFormatted,
        why,
        row.userId
      ).catch((err) => console.error('Error sending series cancellation email:', err));
    }
  } catch (error) {
    console.error('Error notifying series cancellations:', error);
  }
}

export type { ReconcilePlan, SeriesInstance };
