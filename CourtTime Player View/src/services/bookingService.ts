import { query, transaction } from '../database/connection';
import {
  rulesEngine,
  EvaluationResult,
  RuleResult,
  BookingRequest,
  ProvisionalBookingSlice
} from './rulesEngine';
import {
  parseStoredFacilityBookingRules,
  resolveDailyIndividualFromBookingRules,
  resolveWeeklyIndividualFromBookingRules,
  resolveDailyHouseholdFromBookingRules,
  resolveWeeklyHouseholdFromBookingRules
} from './rulesEngine/RuleContext';
import type { FacilityRuleConfig } from './rulesEngine/types';
import { sendStrikeIssuedEmail, sendLockoutEmail } from './emailService';
import { notificationService } from './notificationService';
import { buildTermsAcceptanceBookingBlocker } from './termsService';
import { buildCourtWaiverBookingBlocker } from './courtWaiverService';
import { courtBookingNeedsPayment, loadCourtPaymentSettings } from './courtPaymentSettings';

/**
 * Serialize booking creates per user + facility so concurrent multi-court POSTs
 * (e.g. Promise.all from Quick Reserve) each see prior rows after commits.
 */
const bookingCreationTail = new Map<string, Promise<unknown>>();

function enqueueBookingCreation<T>(
  userId: string,
  facilityId: string,
  fn: () => Promise<T>
): Promise<T> {
  const key = `${userId}:${facilityId}`;
  const prev = bookingCreationTail.get(key) ?? Promise.resolve();
  const run = prev.then(() => fn());
  bookingCreationTail.set(key, run.then(() => undefined, () => undefined));
  return run;
}

function mondayWeekBoundsYmd(bookingDateYmd: string): { weekStart: string; weekEnd: string } {
  const [wy, wm, wd] = bookingDateYmd.split('-').map(Number);
  const weekStartDate = new Date(wy, wm - 1, wd, 12, 0, 0, 0);
  const dow = weekStartDate.getDay();
  const diffToMonday = dow === 0 ? -6 : 1 - dow;
  weekStartDate.setDate(weekStartDate.getDate() + diffToMonday);
  weekStartDate.setHours(0, 0, 0, 0);
  const weekEndDate = new Date(weekStartDate);
  weekEndDate.setDate(weekStartDate.getDate() + 6);
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { weekStart: fmt(weekStartDate), weekEnd: fmt(weekEndDate) };
}

async function isFacilityAdminUser(userId: string, facilityId: string): Promise<boolean> {
  const result = await query(
    `SELECT
       COALESCE(
         (
           SELECT fm.is_facility_admin
           FROM facility_memberships fm
           WHERE fm.user_id = $1 AND fm.facility_id = $2
           LIMIT 1
         ),
         false
       ) OR EXISTS(
         SELECT 1
         FROM facility_admins fa
         WHERE fa.user_id = $1
           AND fa.facility_id = $2
           AND fa.status = 'active'
       ) AS "isFacilityAdmin"`,
    [userId, facilityId]
  );
  return !!result.rows[0]?.isFacilityAdmin;
}

/** Provisional slices not yet persisted (avoids double-count with DB after sequential creates). */
async function countProvisionalsNotInDb(
  userId: string,
  facilityId: string,
  prov: ProvisionalBookingSlice[],
  predicate: (p: ProvisionalBookingSlice) => boolean
): Promise<number> {
  const relevant = prov.filter(predicate);
  let n = 0;
  for (const p of relevant) {
    const r = await query(
      `SELECT 1 FROM bookings
       WHERE user_id = $1 AND facility_id = $2 AND booking_date = $3::date
         AND court_id = $4 AND start_time = $5 AND end_time = $6
         AND status != 'cancelled'
       LIMIT 1`,
      [userId, facilityId, p.bookingDate, p.courtId, p.startTime, p.endTime]
    );
    if (r.rows.length === 0) n++;
  }
  return n;
}

/**
 * DB-backed caps from facilities.booking_rules (safety net if the rules engine path misses limits).
 */
async function assertHardBookingRuleCaps(bookingData: {
  userId: string;
  facilityId: string;
  bookingDate: string;
  provisionalSameRequestBookings?: ProvisionalBookingSlice[];
}): Promise<BookingResult | null> {
  const facRow = await query(
    `SELECT booking_rules AS "bookingRules" FROM facilities WHERE id = $1`,
    [bookingData.facilityId]
  );
  const { bookingRulesRaw, simplifiedBookingRules } = parseStoredFacilityBookingRules(
    facRow.rows[0]?.bookingRules
  );
  if (await isFacilityAdminUser(bookingData.userId, bookingData.facilityId)) {
    return null;
  }

  let acc002ForCaps: FacilityRuleConfig[] | undefined;
  try {
    const acc002Res = await query(
      `SELECT frc.rule_config AS "ruleConfig"
       FROM facility_rule_configs frc
       INNER JOIN booking_rule_definitions brd ON brd.id = frc.rule_definition_id
       WHERE frc.facility_id = $1 AND brd.rule_code = 'ACC-002' AND frc.is_enabled = true
       LIMIT 1`,
      [bookingData.facilityId]
    );
    if (acc002Res.rows.length > 0) {
      const rc = acc002Res.rows[0].ruleConfig;
      acc002ForCaps = [
        {
          id: '',
          facilityId: bookingData.facilityId,
          ruleDefinitionId: '',
          ruleCode: 'ACC-002',
          ruleCategory: 'account',
          ruleName: 'Max Reservations Per Week',
          ruleConfig: typeof rc === 'string' ? JSON.parse(rc) : rc,
          isEnabled: true,
          priority: 0
        }
      ];
    }
  } catch {
    acc002ForCaps = undefined;
  }

  const facilityLike = { bookingRulesRaw, simplifiedBookingRules, rules: acc002ForCaps };
  const prov = bookingData.provisionalSameRequestBookings ?? [];
  const day = bookingData.bookingDate;
  const { weekStart, weekEnd } = mondayWeekBoundsYmd(bookingData.bookingDate);
  const provInWeek = await countProvisionalsNotInDb(
    bookingData.userId,
    bookingData.facilityId,
    prov,
    (p) => p.bookingDate >= weekStart && p.bookingDate <= weekEnd
  );

  const userWeekRes = await query(
    `SELECT COUNT(*)::int AS c FROM bookings
     WHERE user_id = $1 AND facility_id = $2
       AND booking_date >= $3::date AND booking_date <= $4::date
       AND status != 'cancelled'`,
    [bookingData.userId, bookingData.facilityId, weekStart, weekEnd]
  );
  const userWeekCount = Number(userWeekRes.rows[0]?.c ?? 0) + provInWeek;

  const provisionalForDay = await countProvisionalsNotInDb(
    bookingData.userId,
    bookingData.facilityId,
    prov,
    (p) => p.bookingDate === day
  );

  const userDayRes = await query(
    `SELECT COUNT(*)::int AS c FROM bookings
     WHERE user_id = $1 AND facility_id = $2 AND booking_date = $3::date AND status != 'cancelled'`,
    [bookingData.userId, bookingData.facilityId, day]
  );
  const userDayCount = Number(userDayRes.rows[0]?.c ?? 0) + provisionalForDay;

  const dailyInd = resolveDailyIndividualFromBookingRules(facilityLike);
  if (dailyInd.enabled && dailyInd.limit > 0 && userDayCount >= dailyInd.limit) {
    const v = {
      ruleCode: 'SIMPLE-DAY-USER',
      ruleName: 'Courts Per Day (Individual)',
      passed: false as const,
      severity: 'error' as const,
      message: `You have reached your daily booking limit of ${dailyInd.limit}`
    };
    return {
      success: false,
      error: v.message,
      ruleViolations: [v],
      warnings: [],
      isPrimeTime: false
    };
  }

  const weeklyInd = resolveWeeklyIndividualFromBookingRules(facilityLike);
  if (weeklyInd.enabled && weeklyInd.limit > 0 && userWeekCount >= weeklyInd.limit) {
    const v = {
      ruleCode: 'SIMPLE-WEEK-USER',
      ruleName: 'Courts Per Week (Individual)',
      passed: false as const,
      severity: 'error' as const,
      message: `You have reached your weekly booking limit of ${weeklyInd.limit}`
    };
    return {
      success: false,
      error: v.message,
      ruleViolations: [v],
      warnings: [],
      isPrimeTime: false
    };
  }

  const hh = await query(
    `SELECT hg.id AS id FROM household_groups hg
     INNER JOIN household_members hm ON hm.household_id = hg.id
     WHERE hm.user_id = $1 AND hg.facility_id = $2
     LIMIT 1`,
    [bookingData.userId, bookingData.facilityId]
  );
  const householdId = hh.rows[0]?.id as string | undefined;

  const dailyHh = resolveDailyHouseholdFromBookingRules(facilityLike);
  const weeklyHh = resolveWeeklyHouseholdFromBookingRules(facilityLike);

  if (householdId) {
    const hhDayRes = await query(
      `SELECT COUNT(*)::int AS c FROM bookings b
       INNER JOIN household_members hm ON b.user_id = hm.user_id
       WHERE hm.household_id = $1 AND b.facility_id = $2
         AND b.booking_date = $3::date AND b.status != 'cancelled'`,
      [householdId, bookingData.facilityId, day]
    );
    const householdDayCount = Number(hhDayRes.rows[0]?.c ?? 0) + provisionalForDay;

    if (dailyHh.enabled && dailyHh.limit > 0 && householdDayCount >= dailyHh.limit) {
      const v = {
        ruleCode: 'SIMPLE-DAY-HOUSEHOLD',
        ruleName: 'Courts Per Day (Household)',
        passed: false as const,
        severity: 'error' as const,
        message: `Your household has reached its daily booking limit of ${dailyHh.limit}`
      };
      return {
        success: false,
        error: v.message,
        ruleViolations: [v],
        warnings: [],
        isPrimeTime: false
      };
    }

    const hhWeekRes = await query(
      `SELECT COUNT(*)::int AS c FROM bookings b
       INNER JOIN household_members hm ON b.user_id = hm.user_id
       WHERE hm.household_id = $1 AND b.facility_id = $2
         AND b.booking_date >= $3::date AND b.booking_date <= $4::date
         AND b.status != 'cancelled'`,
      [householdId, bookingData.facilityId, weekStart, weekEnd]
    );
    const householdWeekCount = Number(hhWeekRes.rows[0]?.c ?? 0) + provInWeek;

    if (weeklyHh.enabled && weeklyHh.limit > 0 && householdWeekCount >= weeklyHh.limit) {
      const v = {
        ruleCode: 'SIMPLE-WEEK-HOUSEHOLD',
        ruleName: 'Courts Per Week (Household)',
        passed: false as const,
        severity: 'error' as const,
        message: `Your household has reached its weekly booking limit of ${weeklyHh.limit}`
      };
      return {
        success: false,
        error: v.message,
        ruleViolations: [v],
        warnings: [],
        isPrimeTime: false
      };
    }
  } else if (dailyHh.enabled || weeklyHh.enabled) {
    // Household limits are configured but this user is not in household_groups yet:
    // enforce against this member only so caps are not silently ignored.
    if (dailyHh.enabled && dailyHh.limit > 0 && userDayCount >= dailyHh.limit) {
      const v = {
        ruleCode: 'SIMPLE-DAY-HOUSEHOLD',
        ruleName: 'Courts Per Day (Household)',
        passed: false as const,
        severity: 'error' as const,
        message: `Your household has reached its daily booking limit of ${dailyHh.limit}. Add members under Households to share this cap across everyone at your address.`
      };
      return {
        success: false,
        error: v.message,
        ruleViolations: [v],
        warnings: [],
        isPrimeTime: false
      };
    }
    if (weeklyHh.enabled && weeklyHh.limit > 0 && userWeekCount >= weeklyHh.limit) {
      const v = {
        ruleCode: 'SIMPLE-WEEK-HOUSEHOLD',
        ruleName: 'Courts Per Week (Household)',
        passed: false as const,
        severity: 'error' as const,
        message: `Your household has reached its weekly booking limit of ${weeklyHh.limit}. Add members under Households to share this cap across everyone at your address.`
      };
      return {
        success: false,
        error: v.message,
        ruleViolations: [v],
        warnings: [],
        isPrimeTime: false
      };
    }
  }

  return null;
}

export interface Booking {
  id: string;
  seriesId?: string | null;
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
        b.series_id as "seriesId",
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
        b.bulletin_post_id as "bulletinPostId",
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

export async function getBookingsByFacilityAndDateRange(
  facilityId: string,
  startDate: string,
  endDate: string
): Promise<Booking[]> {
  try {
    const result = await query(
      `SELECT
        b.id,
        b.series_id as "seriesId",
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
        b.bulletin_post_id as "bulletinPostId",
        b.created_at as "createdAt",
        b.updated_at as "updatedAt",
        c.name as "courtName",
        u.full_name as "userName",
        u.email as "userEmail"
      FROM bookings b
      JOIN courts c ON b.court_id = c.id
      JOIN users u ON b.user_id = u.id
      WHERE b.facility_id = $1
        AND b.booking_date >= $2
        AND b.booking_date <= $3
        AND b.status != 'cancelled'
      ORDER BY b.booking_date, b.start_time`,
      [facilityId, startDate, endDate]
    );

    return result.rows;
  } catch (error) {
    console.error('Error fetching bookings by range:', error);
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
        b.series_id as "seriesId",
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
          b.series_id as "seriesId",
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
          b.series_id as "seriesId",
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
  requiresPayment?: boolean;
  checkoutUrl?: string;
}

export type PendingCourtBookingPayload = {
  courtId: string;
  userId: string;
  facilityId: string;
  seriesId?: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  bookingType?: string;
  activityType?: string;
  notes?: string;
  isPrimeTime?: boolean;
  bringGuest?: boolean;
  addBallMachine?: boolean;
};

function sameMemberId(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return String(a).toLowerCase() === String(b).toLowerCase();
}

function normalizeTimeForDb(time: string): string {
  const part = time.includes('T') ? time.split('T')[1]! : time;
  const m = part.trim().match(/(\d{1,2}):(\d{2})/);
  if (!m) return time;
  return `${m[1].padStart(2, '0')}:${m[2]}:00`;
}

/** Parse pending_booking JSONB from connect_payments (camelCase or legacy snake_case). */
export function parsePendingCourtBooking(raw: unknown): PendingCourtBookingPayload | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const courtId = String(r.courtId ?? r.court_id ?? '');
  const userId = String(r.userId ?? r.user_id ?? '');
  const facilityId = String(r.facilityId ?? r.facility_id ?? '');
  const bookingDate = String(r.bookingDate ?? r.booking_date ?? '').slice(0, 10);
  const startTime = normalizeTimeForDb(String(r.startTime ?? r.start_time ?? ''));
  const endTime = normalizeTimeForDb(String(r.endTime ?? r.end_time ?? ''));
  let durationMinutes = Number(r.durationMinutes ?? r.duration_minutes ?? 0);
  if (!durationMinutes && startTime && endTime) {
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    durationMinutes = eh * 60 + em - (sh * 60 + sm);
  }
  if (!courtId || !userId || !facilityId || !bookingDate || !startTime || !endTime) return null;
  return {
    courtId,
    userId,
    facilityId,
    bookingDate,
    startTime,
    endTime,
    durationMinutes: durationMinutes > 0 ? durationMinutes : 30,
    seriesId: r.seriesId ? String(r.seriesId) : undefined,
    bookingType: r.bookingType ? String(r.bookingType) : undefined,
    activityType: r.activityType ? String(r.activityType) : undefined,
    notes: r.notes ? String(r.notes) : undefined,
    isPrimeTime: r.isPrimeTime === true || r.is_prime_time === true,
    bringGuest: r.bringGuest === true || r.bring_guest === true,
    addBallMachine: r.addBallMachine === true || r.add_ball_machine === true,
  };
}

export interface RecurringSeriesRequest {
  userId: string;
  facilityId: string;
  bookingType?: string;
  notes?: string;
  instances: Array<{
    courtId: string;
    bookingDate: string;
    startTime: string;
    endTime: string;
    durationMinutes: number;
  }>;
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
  /** Earlier instances in the same multi-create/recurring request (not in DB yet) */
  provisionalSameRequestBookings?: ProvisionalBookingSlice[];
}): Promise<EvaluationResult> {
  const termsBlocker = await buildTermsAcceptanceBookingBlocker(
    bookingData.userId,
    bookingData.facilityId
  );
  if (termsBlocker) {
    return {
      allowed: false,
      results: [termsBlocker],
      blockers: [termsBlocker],
      warnings: [],
      isPrimeTime: false,
    };
  }

  const waiverBlocker = await buildCourtWaiverBookingBlocker(
    bookingData.userId,
    bookingData.courtId
  );
  if (waiverBlocker) {
    return {
      allowed: false,
      results: [waiverBlocker],
      blockers: [waiverBlocker],
      warnings: [],
      isPrimeTime: false,
    };
  }

  const walkUpCourt = await query(
    `SELECT 1 FROM courts WHERE id = $1 AND is_walk_up = true`,
    [bookingData.courtId]
  );
  if (walkUpCourt.rows.length > 0) {
    const blocker = {
      ruleCode: 'COURT-WALKUP-ONLY',
      ruleName: 'Walk-up only court',
      message: 'This is a walk-up only court and cannot be booked online.',
      severity: 'error' as const,
      passed: false,
    };
    return {
      allowed: false,
      results: [blocker],
      blockers: [blocker],
      warnings: [],
      isPrimeTime: false,
    };
  }

  const hardCap = await assertHardBookingRuleCaps({
    userId: bookingData.userId,
    facilityId: bookingData.facilityId,
    bookingDate: bookingData.bookingDate,
    provisionalSameRequestBookings: bookingData.provisionalSameRequestBookings
  });
  if (hardCap?.ruleViolations?.length) {
    const blockers = hardCap.ruleViolations;
    return {
      allowed: false,
      results: blockers,
      blockers,
      warnings: [],
      isPrimeTime: false
    };
  }

  const request: BookingRequest = {
    userId: bookingData.userId,
    courtId: bookingData.courtId,
    facilityId: bookingData.facilityId,
    bookingDate: bookingData.bookingDate,
    startTime: bookingData.startTime,
    endTime: bookingData.endTime,
    durationMinutes: bookingData.durationMinutes,
    bookingType: bookingData.bookingType,
    activityType: bookingData.activityType,
    provisionalSameRequestBookings: bookingData.provisionalSameRequestBookings
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
  seriesId?: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  bookingType?: string;
  activityType?: string;
  notes?: string;
  bulletinPostId?: string;
  skipRulesValidation?: boolean;  // For admin override
  skipPaymentCheck?: boolean; // After Stripe payment or admin override
  bringGuest?: boolean;
  addBallMachine?: boolean;
  provisionalSameRequestBookings?: ProvisionalBookingSlice[];
  successUrl?: string;
  cancelUrl?: string;
}): Promise<BookingResult> {
  return enqueueBookingCreation(bookingData.userId, bookingData.facilityId, () =>
    createBookingCore(bookingData)
  );
}

async function createBookingCore(bookingData: {
  courtId: string;
  userId: string;
  facilityId: string;
  seriesId?: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  bookingType?: string;
  activityType?: string;
  notes?: string;
  bulletinPostId?: string;
  skipRulesValidation?: boolean;
  skipPaymentCheck?: boolean;
  bringGuest?: boolean;
  addBallMachine?: boolean;
  provisionalSameRequestBookings?: ProvisionalBookingSlice[];
  successUrl?: string;
  cancelUrl?: string;
}): Promise<BookingResult> {
  try {
    const termsBlocker = await buildTermsAcceptanceBookingBlocker(
      bookingData.userId,
      bookingData.facilityId
    );
    if (termsBlocker) {
      return {
        success: false,
        error: termsBlocker.message,
        ruleViolations: [termsBlocker],
      };
    }

    const waiverBlocker = await buildCourtWaiverBookingBlocker(
      bookingData.userId,
      bookingData.courtId
    );
    if (waiverBlocker) {
      return {
        success: false,
        error: waiverBlocker.message,
        ruleViolations: [waiverBlocker],
      };
    }

    const walkUpCourt = await query(
      `SELECT name FROM courts WHERE id = $1 AND is_walk_up = true`,
      [bookingData.courtId]
    );
    if (walkUpCourt.rows.length > 0) {
      return {
        success: false,
        error: 'This is a walk-up only court and cannot be booked online.'
      };
    }

    // Declared here so both the rules block and payment block can access them
    let isPrimeTime = false;
    let warnings: RuleResult[] = [];

    // Evaluate booking rules (unless skipped for admin override)
    if (!bookingData.skipRulesValidation) {
      const evaluation = await validateBooking({
        courtId: bookingData.courtId,
        userId: bookingData.userId,
        facilityId: bookingData.facilityId,
        bookingDate: bookingData.bookingDate,
        startTime: bookingData.startTime,
        endTime: bookingData.endTime,
        durationMinutes: bookingData.durationMinutes,
        bookingType: bookingData.bookingType,
        activityType: bookingData.activityType,
        provisionalSameRequestBookings: bookingData.provisionalSameRequestBookings
      });

      if (!evaluation.allowed) {
        return {
          success: false,
          error: evaluation.blockers[0]?.message || 'Booking not allowed due to rule violations',
          ruleViolations: evaluation.blockers,
          warnings: evaluation.warnings,
          isPrimeTime: evaluation.isPrimeTime
        };
      }

      isPrimeTime = evaluation.isPrimeTime;
      warnings = evaluation.warnings;
    }

    if (!bookingData.skipPaymentCheck) {
      const courtRow = await loadCourtPaymentSettings(bookingData.courtId);
      const needsPayment = courtBookingNeedsPayment(courtRow, {
        bringGuest: bookingData.bringGuest,
        addBallMachine: bookingData.addBallMachine,
      });
      if (needsPayment) {
        const { syncConnectOnboardingStatus, createCourtBookingCheckoutSession } = await import(
          './stripeConnectService'
        );
        const stripeStatus = await syncConnectOnboardingStatus(bookingData.facilityId);
        if (!stripeStatus.onboarded && !stripeStatus.chargesEnabled) {
          return {
            success: false,
            error: 'This court requires payment but the club has not finished Stripe setup yet',
          };
        }
        const base =
          bookingData.successUrl?.replace(/\?.*$/, '').replace(/\/calendar$/, '') ||
          (process.env.NODE_ENV !== 'production'
            ? process.env.DEV_APP_URL || 'http://localhost:5173'
            : process.env.APP_URL || 'http://localhost:5173');
        const { url } = await createCourtBookingCheckoutSession({
          memberId: bookingData.userId,
          pendingBooking: {
            courtId: bookingData.courtId,
            userId: bookingData.userId,
            facilityId: bookingData.facilityId,
            seriesId: bookingData.seriesId,
            bookingDate: bookingData.bookingDate,
            startTime: bookingData.startTime,
            endTime: bookingData.endTime,
            durationMinutes: bookingData.durationMinutes,
            bookingType: bookingData.bookingType,
            activityType: bookingData.activityType,
            notes: bookingData.notes,
            isPrimeTime: isPrimeTime || false,
            bringGuest: bookingData.bringGuest || false,
            addBallMachine: bookingData.addBallMachine || false,
          },
          successUrl:
            bookingData.successUrl ||
            `${base}/calendar?bookingPaymentSuccess=1&session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl: bookingData.cancelUrl || `${base}/calendar?bookingPaymentCancelled=1`,
        });
        return {
          success: true,
          requiresPayment: true,
          checkoutUrl: url,
          warnings: warnings || [],
          isPrimeTime: isPrimeTime || false,
        };
      }
    }

    // Atomically check conflicts and insert to prevent double-booking under concurrency.
    // The FOR UPDATE lock on the court row serializes concurrent booking attempts for the same court.
    let newBooking: any;
    try {
      newBooking = await transaction(async (client) => {
        await client.query(
          `SELECT id FROM courts WHERE id = $1 FOR UPDATE`,
          [bookingData.courtId]
        );

        const conflicts = await client.query(
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
          throw Object.assign(new Error('Time slot is already booked'), { code: 'BOOKING_CONFLICT' });
        }

        const splitAvailability = await client.query(
          `SELECT check_split_court_availability($1, $2::date, $3::time, $4::time) as available`,
          [bookingData.courtId, bookingData.bookingDate, bookingData.startTime, bookingData.endTime]
        );
        if (!splitAvailability.rows[0]?.available) {
          throw Object.assign(
            new Error('A related parent or split court is already booked at this time'),
            { code: 'BOOKING_CONFLICT' }
          );
        }

        const ins = await client.query(
          `INSERT INTO bookings (
            series_id, court_id, user_id, facility_id, booking_date,
            start_time, end_time, duration_minutes, booking_type,
            activity_type, notes, bulletin_post_id, status, is_prime_time,
            bring_guest, add_ball_machine
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'confirmed', $13, $14, $15)
          RETURNING
            id,
            series_id as "seriesId",
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
            bookingData.seriesId || null,
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
            bookingData.bulletinPostId || null,
            isPrimeTime,
            bookingData.bringGuest || false,
            bookingData.addBallMachine || false,
          ]
        );
        return ins.rows[0];
      });
    } catch (txErr: any) {
      if (txErr.code === 'BOOKING_CONFLICT') {
        return { success: false, error: txErr.message };
      }
      throw txErr;
    }

    return {
      success: true,
      booking: newBooking,
      warnings,
      isPrimeTime,
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
 * Create a court booking after Stripe Connect checkout completes.
 */
export async function finalizeBookingAfterPayment(params: {
  connectPaymentId: string;
  memberId: string;
}): Promise<{ bookingId: string; bookingDate?: string } | null> {
  const paymentResult = await query(
    `SELECT id, member_id, booking_id, pending_booking, status
     FROM connect_payments
     WHERE id = $1`,
    [params.connectPaymentId]
  );
  const payment = paymentResult.rows[0];
  if (!payment) return null;
  if (!sameMemberId(payment.member_id, params.memberId)) {
    throw new Error('This payment does not belong to your account');
  }
  if (payment.booking_id) {
    const existing = await query(
      `SELECT TO_CHAR(booking_date, 'YYYY-MM-DD') as "bookingDate" FROM bookings WHERE id = $1`,
      [payment.booking_id]
    );
    return {
      bookingId: payment.booking_id,
      bookingDate: existing.rows[0]?.bookingDate,
    };
  }

  const pending = parsePendingCourtBooking(payment.pending_booking);
  if (!pending) {
    throw new Error('Paid booking details are missing. Please contact the club.');
  }

  const existingBooking = await query(
    `SELECT id FROM bookings
     WHERE court_id = $1 AND booking_date = $2 AND user_id = $3
       AND start_time = $4 AND end_time = $5 AND status != 'cancelled'
     LIMIT 1`,
    [pending.courtId, pending.bookingDate, pending.userId, pending.startTime, pending.endTime]
  );
  if (existingBooking.rows.length > 0) {
    const bookingId = existingBooking.rows[0].id;
    await query(
      `UPDATE bookings SET connect_payment_id = $1 WHERE id = $2`,
      [params.connectPaymentId, bookingId]
    );
    await query(
      `UPDATE connect_payments SET booking_id = $1, pending_booking = NULL WHERE id = $2`,
      [bookingId, params.connectPaymentId]
    );
    return { bookingId, bookingDate: pending.bookingDate };
  }

  const coreResult = await createBookingCore({
    ...pending,
    userId: payment.member_id,
    skipRulesValidation: true,
    skipPaymentCheck: true,
  });
  if (!coreResult.success || !coreResult.booking?.id) {
    throw new Error(coreResult.error || 'Could not create booking after payment');
  }

  await query(
    `UPDATE bookings SET connect_payment_id = $1 WHERE id = $2`,
    [params.connectPaymentId, coreResult.booking.id]
  );
  await query(
    `UPDATE connect_payments SET booking_id = $1, pending_booking = NULL WHERE id = $2`,
    [coreResult.booking.id, params.connectPaymentId]
  );

  return { bookingId: coreResult.booking.id, bookingDate: pending.bookingDate };
}

/**
 * Create bookings for any PAID court-checkout rows that never got a reservation (recovery).
 */
export async function reconcilePaidCourtBookingsWithoutReservation(
  memberId: string
): Promise<Array<{ bookingId: string; bookingDate?: string; connectPaymentId: string }>> {
  const payments = await query(
    `SELECT id
       FROM connect_payments
      WHERE member_id = $1
        AND status = 'PAID'
        AND booking_id IS NULL
        AND pending_booking IS NOT NULL
      ORDER BY paid_at DESC NULLS LAST, created_at DESC
      LIMIT 10`,
    [memberId]
  );

  const recovered: Array<{ bookingId: string; bookingDate?: string; connectPaymentId: string }> = [];
  for (const row of payments.rows) {
    try {
      const result = await finalizeBookingAfterPayment({
        connectPaymentId: row.id,
        memberId,
      });
      if (result?.bookingId) {
        recovered.push({ ...result, connectPaymentId: row.id });
      }
    } catch (err) {
      console.error('reconcilePaidCourtBookingsWithoutReservation failed for', row.id, err);
    }
  }
  return recovered;
}

export async function createRecurringBookingSeries(
  payload: RecurringSeriesRequest
): Promise<BookingResult & { seriesId?: string; bookings?: Booking[] }> {
  return enqueueBookingCreation(payload.userId, payload.facilityId, () =>
    createRecurringBookingSeriesCore(payload)
  );
}

async function createRecurringBookingSeriesCore(
  payload: RecurringSeriesRequest
): Promise<BookingResult & { seriesId?: string; bookings?: Booking[] }> {
  try {
    const blockers: RuleResult[] = [];
    const warnings: RuleResult[] = [];
    const priorInThisRequest: ProvisionalBookingSlice[] = [];

    for (const instance of payload.instances) {
      const walkUpCourt = await query(
        `SELECT 1 FROM courts WHERE id = $1 AND is_walk_up = true`,
        [instance.courtId]
      );
      if (walkUpCourt.rows.length > 0) {
        return {
          success: false,
          error: 'This is a walk-up only court and cannot be booked online.'
        };
      }

      const validation = await validateBooking({
        courtId: instance.courtId,
        userId: payload.userId,
        facilityId: payload.facilityId,
        bookingDate: instance.bookingDate,
        startTime: instance.startTime,
        endTime: instance.endTime,
        durationMinutes: instance.durationMinutes,
        bookingType: payload.bookingType,
        provisionalSameRequestBookings:
          priorInThisRequest.length > 0 ? [...priorInThisRequest] : undefined
      });

      if (!validation.allowed) {
        blockers.push(...validation.blockers);
      }
      if (validation.warnings?.length) {
        warnings.push(...validation.warnings);
      }

      priorInThisRequest.push({
        bookingDate: instance.bookingDate,
        courtId: instance.courtId,
        startTime: instance.startTime,
        endTime: instance.endTime,
        durationMinutes: instance.durationMinutes
      });
    }

    if (blockers.length > 0) {
      return {
        success: false,
        error: blockers[0]?.message || 'Recurring booking failed validation',
        ruleViolations: blockers,
        warnings
      };
    }

    // Conflict check and inserts share one transaction so concurrent bookings
    // cannot steal a slot between validation and insert.
    const created = await transaction(async (client) => {
      const seriesResult = await client.query(
        `INSERT INTO booking_series (facility_id, created_by, notes)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [payload.facilityId, payload.userId, payload.notes || null]
      );

      const seriesId = seriesResult.rows[0].id as string;
      const rows: Booking[] = [];

      for (const instance of payload.instances) {
        // Lock the court row to serialize concurrent booking attempts
        await client.query(`SELECT id FROM courts WHERE id = $1 FOR UPDATE`, [instance.courtId]);

        const conflicts = await client.query(
          `SELECT id FROM bookings
           WHERE court_id = $1 AND booking_date = $2 AND status != 'cancelled'
             AND (
               (start_time <= $3 AND end_time > $3)
               OR (start_time < $4 AND end_time >= $4)
               OR (start_time >= $3 AND end_time <= $4)
             )`,
          [instance.courtId, instance.bookingDate, instance.startTime, instance.endTime]
        );
        if (conflicts.rows.length > 0) {
          throw Object.assign(
            new Error('One or more recurring instances conflict with existing bookings.'),
            { code: 'BOOKING_CONFLICT' }
          );
        }

        const splitAvailability = await client.query(
          `SELECT check_split_court_availability($1, $2::date, $3::time, $4::time) as available`,
          [instance.courtId, instance.bookingDate, instance.startTime, instance.endTime]
        );
        if (!splitAvailability.rows[0]?.available) {
          throw Object.assign(
            new Error('One or more recurring instances conflict with a parent or split court.'),
            { code: 'BOOKING_CONFLICT' }
          );
        }

        const insert = await client.query(
          `INSERT INTO bookings (
             series_id, court_id, user_id, facility_id, booking_date,
             start_time, end_time, duration_minutes, booking_type,
             notes, status, is_prime_time
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'confirmed', false)
           RETURNING
             id,
             series_id as "seriesId",
             court_id as "courtId",
             user_id as "userId",
             facility_id as "facilityId",
             TO_CHAR(booking_date, 'YYYY-MM-DD') as "bookingDate",
             start_time as "startTime",
             end_time as "endTime",
             duration_minutes as "durationMinutes",
             status,
             booking_type as "bookingType",
             notes,
             created_at as "createdAt",
             updated_at as "updatedAt"`,
          [
            seriesId,
            instance.courtId,
            payload.userId,
            payload.facilityId,
            instance.bookingDate,
            instance.startTime,
            instance.endTime,
            instance.durationMinutes,
            payload.bookingType || null,
            payload.notes || null
          ]
        );
        rows.push(insert.rows[0]);
      }

      return { seriesId, rows };
    });

    return {
      success: true,
      seriesId: created.seriesId,
      bookings: created.rows,
      warnings
    };
  } catch (error) {
    console.error('Error creating recurring booking series:', error);
    return {
      success: false,
      error: 'Failed to create recurring booking series'
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
  override: {
    adminUserId: string;
    reason: string;
    overriddenRules?: string[];
  }
): Promise<BookingResult> {
  const adminId = override.adminUserId;
  const overrideReason = override.reason;
  try {
    const termsBlocker = await buildTermsAcceptanceBookingBlocker(
      bookingData.userId,
      bookingData.facilityId
    );
    if (termsBlocker) {
      return {
        success: false,
        error: termsBlocker.message,
        ruleViolations: [termsBlocker],
      };
    }

    // No court-waiver blocker here: waivers are accepted per booking by the
    // member themselves, which an admin-created booking can never satisfy.
    // An admin override is an explicit bypass of booking rules.

    const walkUpCourt = await query(
      `SELECT 1 FROM courts WHERE id = $1 AND is_walk_up = true`,
      [bookingData.courtId]
    );
    if (walkUpCourt.rows.length > 0) {
      return {
        success: false,
        error: 'This is a walk-up only court and cannot be booked online.'
      };
    }

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

    // Check for direct time slot conflicts
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

    // Check split court parent/child conflicts
    const splitAvailability = await query(
      `SELECT check_split_court_availability($1, $2::date, $3::time, $4::time) as available`,
      [bookingData.courtId, bookingData.bookingDate, bookingData.startTime, bookingData.endTime]
    );

    if (!splitAvailability.rows[0]?.available) {
      return {
        success: false,
        error: 'A related parent or split court is already booked at this time'
      };
    }

    // Build override info
    const ruleOverrides = evaluation.blockers.map(b => b.ruleCode);

    // Insert the booking with override info
    const result = await query(
      `INSERT INTO bookings (
        series_id, court_id, user_id, facility_id, booking_date,
        start_time, end_time, duration_minutes, booking_type,
        activity_type, notes, status, is_prime_time,
        rule_overrides, override_reason, overridden_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'confirmed', $12, $13, $14, $15)
      RETURNING
        id,
        series_id as "seriesId",
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
        null,
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
        TO_CHAR(b.booking_date, 'YYYY-MM-DD') as "bookingDate",
        b.start_time as "startTime",
        b.end_time as "endTime",
        b.user_id as "userId"
      FROM bookings b
      WHERE b.id = $1 AND b.status != 'cancelled'`,
      [bookingId]
    );

    if (bookingResult.rows.length === 0) {
      return {
        success: false,
        error: 'Booking not found'
      };
    }

    const booking = bookingResult.rows[0];
    const isOwner = booking.userId === userId;
    const adminResult = isOwner ? { rows: [] } : await query(
      `SELECT 1 FROM facility_admins
       WHERE user_id = $1 AND facility_id = $2 AND status = 'active'
       LIMIT 1`,
      [userId, booking.facilityId]
    );
    const isFacilityAdmin = adminResult.rows.length > 0;

    if (!isOwner && !isFacilityAdmin) {
      return {
        success: false,
        error: 'Booking not found or unauthorized'
      };
    }

    // Evaluate cancellation rules
    const cancellationEval = await rulesEngine.evaluateCancellation({
      bookingId,
      userId: booking.userId,
      facilityId: booking.facilityId,
      reason
    });

    if (!cancellationEval.allowed) {
      return {
        success: false,
        error: cancellationEval.message || 'Cancellation is not allowed'
      };
    }

    // Calculate minutes before start (use facility timezone for accurate comparison)
    const facilityTzResult = await query('SELECT timezone FROM facilities WHERE id = $1', [booking.facilityId]);
    const facilityTz = facilityTzResult.rows[0]?.timezone || 'America/New_York';
    const { getFacilityLocalNow } = await import('./rulesEngine/RuleContext');
    const now = getFacilityLocalNow(facilityTz);
    // Create bookingStart using local components (same approach as combineDateAndTime)
    // so the comparison with facility-local "now" is accurate
    const [bYear, bMonth, bDay] = booking.bookingDate.split('-').map(Number);
    const [bHour, bMin] = booking.startTime.split(':').map(Number);
    const bookingStart = new Date(bYear, bMonth - 1, bDay, bHour, bMin, 0);
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
      booking.userId,
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
        booking.userId,
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
        b.series_id as "seriesId",
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

    const strikeId = result.rows[0]?.id;

    // Fire-and-forget: send email + in-app notification
    if (strikeId) {
      sendStrikeNotifications(userId, facilityId, strikeType, reason, expiresAt?.toISOString() ?? null).catch((err) => console.error('Strike notification error:', err));
    }

    return strikeId;
  } catch (error) {
    console.error('Failed to issue strike:', error);
    return undefined;
  }
}

/**
 * Send email + in-app notifications after a strike is issued
 */
async function sendStrikeNotifications(
  userId: string,
  facilityId: string,
  strikeType: string,
  reason: string,
  expiresAt: string | null
): Promise<void> {
  try {
    // Fetch user email + name
    const userResult = await query(
      'SELECT email, full_name as "fullName" FROM users WHERE id = $1',
      [userId]
    );
    const user = userResult.rows[0];
    if (!user) return;

    // Fetch facility name
    const facilityResult = await query(
      'SELECT name FROM facilities WHERE id = $1',
      [facilityId]
    );
    const facilityName = facilityResult.rows[0]?.name || 'your facility';

    // Send email notification
    await sendStrikeIssuedEmail(user.email, user.fullName, strikeType, reason, facilityId, facilityName, expiresAt, userId);

    // Create in-app notification
    await notificationService.notifyStrikeIssued(userId, facilityName, strikeType, reason);

    // Check if user is now locked out (strike count >= threshold)
    const configResult = await query(
      `SELECT rule_config FROM facility_rule_configs frc
       JOIN booking_rule_definitions brd ON frc.rule_definition_id = brd.id
       WHERE frc.facility_id = $1 AND brd.rule_code = 'ACC-009' AND frc.is_enabled = true`,
      [facilityId]
    );
    const config = configResult.rows[0]?.rule_config || { strike_threshold: 3, strike_window_days: 30, lockout_days: 7 };
    const threshold = config.strike_threshold || 3;
    const windowDays = config.strike_window_days || 30;
    const lockoutDays = config.lockout_days || 7;

    const activeResult = await query(
      `SELECT COUNT(*) as count FROM account_strikes
       WHERE user_id = $1 AND facility_id = $2
         AND revoked = false
         AND issued_at > CURRENT_TIMESTAMP - INTERVAL '1 day' * $3`,
      [userId, facilityId, windowDays]
    );
    const activeCount = parseInt(activeResult.rows[0].count);

    if (activeCount >= threshold) {
      const lockoutEndsAt = new Date(Date.now() + lockoutDays * 24 * 60 * 60 * 1000).toISOString();
      await sendLockoutEmail(user.email, user.fullName, facilityId, facilityName, lockoutEndsAt, userId);
      await notificationService.notifyAccountLockedOut(userId, facilityName, lockoutEndsAt);
    }
  } catch (error) {
    console.error('Failed to send strike notifications:', error);
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
  markedBy: string,
  reason?: string
): Promise<{ success: boolean; strikeId?: string; error?: string }> {
  try {
    // Get booking details
    const bookingResult = await query(
      `SELECT user_id as "userId", facility_id as "facilityId" FROM bookings WHERE id = $1`,
      [bookingId]
    );

    if (bookingResult.rows.length === 0) {
      return { success: false, error: 'Booking not found' };
    }

    const userId = bookingResult.rows[0].userId;
    const facilityId = bookingResult.rows[0].facilityId;

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
      reason || 'Did not show up for reservation',
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
  bookingId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Verify booking exists, is confirmed, and facility/court/member are all active
    const bookingCheck = await query(
      `SELECT b.id, b.user_id, b.facility_id, b.court_id,
              f.status as facility_status, f.name as facility_name,
              c.status as court_status, c.name as court_name,
              fm.status as member_status
       FROM bookings b
       JOIN facilities f ON b.facility_id = f.id
       JOIN courts c ON b.court_id = c.id
       LEFT JOIN facility_memberships fm ON b.user_id = fm.user_id AND b.facility_id = fm.facility_id
       WHERE b.id = $1 AND b.status = 'confirmed'`,
      [bookingId]
    );

    if (bookingCheck.rows.length === 0) {
      return { success: false, error: 'Booking not found or not confirmed' };
    }

    const booking = bookingCheck.rows[0];

    if (booking.facility_status === 'suspended' || booking.facility_status === 'closed') {
      return { success: false, error: `${booking.facility_name} is currently ${booking.facility_status} and check-ins are not available.` };
    }
    if (booking.court_status === 'maintenance' || booking.court_status === 'closed') {
      return { success: false, error: `${booking.court_name} is currently ${booking.court_status === 'maintenance' ? 'under maintenance' : 'closed'}.` };
    }
    if (booking.member_status === 'suspended') {
      return { success: false, error: 'Your membership is currently suspended. Please contact the facility.' };
    }

    const result = await query(
      `UPDATE bookings
       SET checked_in = true, checked_in_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND status = 'confirmed'
       RETURNING id`,
      [bookingId]
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
