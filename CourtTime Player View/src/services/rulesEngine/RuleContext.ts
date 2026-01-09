/**
 * Rule Context Builder
 * Builds the context object required for rule evaluation by fetching all necessary data
 */

import { query } from '../../database/connection';
import {
  BookingRequest,
  RuleContext,
  UserWithTier,
  MembershipTier,
  CourtWithConfig,
  CourtOperatingConfig,
  CourtAllowedActivity,
  CourtBlackout,
  FacilityWithRules,
  FacilityRuleConfig,
  HouseholdGroup,
  HouseholdMember,
  BookingWithDetails,
  AccountStrike,
  BookingCancellation
} from './types';
import { isPrimeTime } from './utils/primeTimeUtils';

/**
 * Build the complete rule context for a booking request
 */
export async function buildRuleContext(request: BookingRequest): Promise<RuleContext> {
  // Fetch all required data in parallel
  const [
    user,
    court,
    facility,
    household,
    userBookings,
    courtBookings,
    strikes,
    recentCancellations,
    blackouts
  ] = await Promise.all([
    fetchUserWithTier(request.userId, request.facilityId),
    fetchCourtWithConfig(request.courtId),
    fetchFacilityWithRules(request.facilityId),
    fetchUserHousehold(request.userId, request.facilityId),
    fetchUserBookings(request.userId, request.facilityId),
    fetchCourtBookings(request.courtId, request.bookingDate),
    fetchUserStrikes(request.userId, request.facilityId),
    fetchRecentCancellations(request.userId, request.facilityId),
    fetchCourtBlackouts(request.courtId, request.facilityId, request.bookingDate)
  ]);

  // Fetch household bookings if household exists
  let householdBookings: BookingWithDetails[] = [];
  if (household) {
    householdBookings = await fetchHouseholdBookings(household.id);
  }

  // Determine if booking is prime time
  const bookingIsPrimeTime = court.operatingConfig
    ? isPrimeTime(court.operatingConfig, request.bookingDate, request.startTime, request.endTime)
    : false;

  return {
    request,
    user,
    court,
    facility,
    household: household || undefined,
    existingBookings: {
      user: userBookings,
      household: householdBookings,
      court: courtBookings
    },
    strikes,
    recentCancellations,
    blackouts,
    currentDateTime: new Date(),
    isPrimeTime: bookingIsPrimeTime
  };
}

/**
 * Fetch user with their membership tier
 */
async function fetchUserWithTier(userId: string, facilityId: string): Promise<UserWithTier> {
  const result = await query(
    `SELECT
      u.id,
      u.email,
      u.full_name as "fullName",
      u.street_address as "streetAddress",
      u.city,
      u.state,
      u.zip_code as "zipCode",
      fm.is_facility_admin as "isFacilityAdmin",
      mt.id as "tierId",
      mt.tier_name as "tierName",
      mt.tier_level as "tierLevel",
      mt.advance_booking_days as "advanceBookingDays",
      mt.prime_time_eligible as "primeTimeEligible",
      mt.prime_time_max_per_week as "primeTimeMaxPerWeek",
      mt.max_active_reservations as "maxActiveReservations",
      mt.max_reservations_per_week as "maxReservationsPerWeek",
      mt.max_minutes_per_week as "maxMinutesPerWeek",
      mt.description as "tierDescription",
      mt.is_default as "tierIsDefault"
    FROM users u
    LEFT JOIN facility_memberships fm ON u.id = fm.user_id AND fm.facility_id = $2
    LEFT JOIN user_tiers ut ON u.id = ut.user_id AND ut.facility_id = $2
      AND (ut.expires_at IS NULL OR ut.expires_at > CURRENT_TIMESTAMP)
    LEFT JOIN membership_tiers mt ON ut.tier_id = mt.id
    WHERE u.id = $1`,
    [userId, facilityId]
  );

  if (result.rows.length === 0) {
    throw new Error(`User not found: ${userId}`);
  }

  const row = result.rows[0];

  let tier: MembershipTier | undefined;
  if (row.tierId) {
    tier = {
      id: row.tierId,
      facilityId,
      tierName: row.tierName,
      tierLevel: row.tierLevel,
      advanceBookingDays: row.advanceBookingDays,
      primeTimeEligible: row.primeTimeEligible,
      primeTimeMaxPerWeek: row.primeTimeMaxPerWeek,
      maxActiveReservations: row.maxActiveReservations,
      maxReservationsPerWeek: row.maxReservationsPerWeek,
      maxMinutesPerWeek: row.maxMinutesPerWeek,
      description: row.tierDescription,
      isDefault: row.tierIsDefault
    };
  } else {
    // Try to get default tier
    tier = await fetchDefaultTier(facilityId);
  }

  return {
    id: row.id,
    email: row.email,
    fullName: row.fullName,
    streetAddress: row.streetAddress,
    city: row.city,
    state: row.state,
    zipCode: row.zipCode,
    tier,
    isFacilityAdmin: row.isFacilityAdmin || false
  };
}

/**
 * Fetch default tier for a facility
 */
async function fetchDefaultTier(facilityId: string): Promise<MembershipTier | undefined> {
  const result = await query(
    `SELECT
      id,
      facility_id as "facilityId",
      tier_name as "tierName",
      tier_level as "tierLevel",
      advance_booking_days as "advanceBookingDays",
      prime_time_eligible as "primeTimeEligible",
      prime_time_max_per_week as "primeTimeMaxPerWeek",
      max_active_reservations as "maxActiveReservations",
      max_reservations_per_week as "maxReservationsPerWeek",
      max_minutes_per_week as "maxMinutesPerWeek",
      description,
      is_default as "isDefault"
    FROM membership_tiers
    WHERE facility_id = $1 AND is_default = true
    LIMIT 1`,
    [facilityId]
  );

  if (result.rows.length === 0) {
    return undefined;
  }

  return result.rows[0];
}

/**
 * Fetch court with operating configuration
 */
async function fetchCourtWithConfig(courtId: string): Promise<CourtWithConfig> {
  // Fetch court basic info
  const courtResult = await query(
    `SELECT
      id,
      facility_id as "facilityId",
      name,
      court_number as "courtNumber",
      surface_type as "surfaceType",
      court_type as "courtType",
      is_indoor as "isIndoor",
      has_lights as "hasLights",
      status
    FROM courts
    WHERE id = $1`,
    [courtId]
  );

  if (courtResult.rows.length === 0) {
    throw new Error(`Court not found: ${courtId}`);
  }

  const court = courtResult.rows[0];

  // Fetch operating config
  const configResult = await query(
    `SELECT
      id,
      court_id as "courtId",
      day_of_week as "dayOfWeek",
      is_open as "isOpen",
      open_time as "openTime",
      close_time as "closeTime",
      prime_time_start as "primeTimeStart",
      prime_time_end as "primeTimeEnd",
      prime_time_max_duration as "primeTimeMaxDuration",
      slot_duration as "slotDuration",
      min_duration as "minDuration",
      max_duration as "maxDuration",
      buffer_before as "bufferBefore",
      buffer_after as "bufferAfter",
      release_time as "releaseTime"
    FROM court_operating_config
    WHERE court_id = $1
    ORDER BY day_of_week`,
    [courtId]
  );

  // Fetch allowed activities
  const activitiesResult = await query(
    `SELECT
      id,
      court_id as "courtId",
      activity_type as "activityType",
      is_allowed as "isAllowed",
      requires_equipment as "requiresEquipment",
      equipment_name as "equipmentName",
      max_concurrent as "maxConcurrent"
    FROM court_allowed_activities
    WHERE court_id = $1`,
    [courtId]
  );

  return {
    ...court,
    operatingConfig: configResult.rows as CourtOperatingConfig[],
    allowedActivities: activitiesResult.rows as CourtAllowedActivity[]
  };
}

/**
 * Fetch facility with configured rules
 */
async function fetchFacilityWithRules(facilityId: string): Promise<FacilityWithRules> {
  // Fetch facility basic info
  const facilityResult = await query(
    `SELECT
      id,
      name,
      operating_hours as "operatingHours"
    FROM facilities
    WHERE id = $1`,
    [facilityId]
  );

  if (facilityResult.rows.length === 0) {
    throw new Error(`Facility not found: ${facilityId}`);
  }

  const facility = facilityResult.rows[0];

  // Fetch configured rules
  const rulesResult = await query(
    `SELECT
      frc.id,
      frc.facility_id as "facilityId",
      frc.rule_definition_id as "ruleDefinitionId",
      brd.rule_code as "ruleCode",
      brd.rule_category as "ruleCategory",
      brd.rule_name as "ruleName",
      frc.rule_config as "ruleConfig",
      frc.is_enabled as "isEnabled",
      frc.applies_to_court_ids as "appliesToCourtIds",
      frc.applies_to_tier_ids as "appliesToTierIds",
      frc.priority,
      brd.failure_message_template as "failureMessageTemplate"
    FROM facility_rule_configs frc
    JOIN booking_rule_definitions brd ON frc.rule_definition_id = brd.id
    WHERE frc.facility_id = $1 AND frc.is_enabled = true
    ORDER BY brd.evaluation_order, frc.priority`,
    [facilityId]
  );

  // Fetch default tier
  const defaultTier = await fetchDefaultTier(facilityId);

  return {
    id: facility.id,
    name: facility.name,
    operatingHours: facility.operatingHours,
    rules: rulesResult.rows as FacilityRuleConfig[],
    defaultTier
  };
}

/**
 * Fetch user's household group
 */
async function fetchUserHousehold(
  userId: string,
  facilityId: string
): Promise<HouseholdGroup | null> {
  // Find household through household_members
  const householdResult = await query(
    `SELECT
      hg.id,
      hg.facility_id as "facilityId",
      hg.hoa_address_id as "hoaAddressId",
      hg.street_address as "streetAddress",
      hg.city,
      hg.state,
      hg.zip_code as "zipCode",
      hg.max_members as "maxMembers",
      hg.household_name as "householdName",
      hg.max_active_reservations as "maxActiveReservations",
      hg.prime_time_max_per_week as "primeTimeMaxPerWeek"
    FROM household_groups hg
    JOIN household_members hm ON hg.id = hm.household_id
    WHERE hm.user_id = $1 AND hg.facility_id = $2`,
    [userId, facilityId]
  );

  if (householdResult.rows.length === 0) {
    return null;
  }

  const household = householdResult.rows[0];

  // Fetch all members
  const membersResult = await query(
    `SELECT
      id,
      household_id as "householdId",
      user_id as "userId",
      is_primary as "isPrimary",
      verification_status as "verificationStatus",
      added_at as "addedAt"
    FROM household_members
    WHERE household_id = $1`,
    [household.id]
  );

  return {
    ...household,
    members: membersResult.rows as HouseholdMember[]
  };
}

/**
 * Fetch user's existing bookings
 */
async function fetchUserBookings(
  userId: string,
  facilityId: string
): Promise<BookingWithDetails[]> {
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
      b.activity_type as "activityType",
      b.notes,
      COALESCE(b.is_prime_time, false) as "isPrimeTime",
      COALESCE(b.checked_in, false) as "checkedIn",
      COALESCE(b.no_show_marked, false) as "noShowMarked",
      b.created_at as "createdAt",
      b.updated_at as "updatedAt",
      c.name as "courtName"
    FROM bookings b
    JOIN courts c ON b.court_id = c.id
    WHERE b.user_id = $1
      AND b.facility_id = $2
      AND b.booking_date >= CURRENT_DATE - INTERVAL '7 days'
      AND b.status != 'cancelled'
    ORDER BY b.booking_date, b.start_time`,
    [userId, facilityId]
  );

  return result.rows;
}

/**
 * Fetch bookings for a household
 */
async function fetchHouseholdBookings(householdId: string): Promise<BookingWithDetails[]> {
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
      b.activity_type as "activityType",
      b.notes,
      COALESCE(b.is_prime_time, false) as "isPrimeTime",
      COALESCE(b.checked_in, false) as "checkedIn",
      COALESCE(b.no_show_marked, false) as "noShowMarked",
      b.created_at as "createdAt",
      b.updated_at as "updatedAt",
      c.name as "courtName",
      u.full_name as "userName"
    FROM bookings b
    JOIN courts c ON b.court_id = c.id
    JOIN users u ON b.user_id = u.id
    JOIN household_members hm ON b.user_id = hm.user_id
    WHERE hm.household_id = $1
      AND b.booking_date >= CURRENT_DATE - INTERVAL '7 days'
      AND b.status != 'cancelled'
    ORDER BY b.booking_date, b.start_time`,
    [householdId]
  );

  return result.rows;
}

/**
 * Fetch court bookings for a specific date
 */
async function fetchCourtBookings(
  courtId: string,
  bookingDate: string
): Promise<BookingWithDetails[]> {
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
      b.activity_type as "activityType",
      COALESCE(b.is_prime_time, false) as "isPrimeTime",
      b.created_at as "createdAt",
      u.full_name as "userName"
    FROM bookings b
    JOIN users u ON b.user_id = u.id
    WHERE b.court_id = $1
      AND b.booking_date = $2
      AND b.status != 'cancelled'
    ORDER BY b.start_time`,
    [courtId, bookingDate]
  );

  return result.rows;
}

/**
 * Fetch user's active strikes
 */
async function fetchUserStrikes(
  userId: string,
  facilityId: string
): Promise<AccountStrike[]> {
  const result = await query(
    `SELECT
      id,
      user_id as "userId",
      facility_id as "facilityId",
      strike_type as "strikeType",
      strike_reason as "strikeReason",
      related_booking_id as "relatedBookingId",
      related_rule_id as "relatedRuleId",
      issued_at as "issuedAt",
      issued_by as "issuedBy",
      expires_at as "expiresAt",
      appealed,
      appeal_notes as "appealNotes",
      appeal_date as "appealDate",
      revoked,
      revoked_at as "revokedAt",
      revoked_by as "revokedBy",
      revoke_reason as "revokeReason"
    FROM account_strikes
    WHERE user_id = $1
      AND facility_id = $2
      AND revoked = false
      AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
    ORDER BY issued_at DESC`,
    [userId, facilityId]
  );

  return result.rows;
}

/**
 * Fetch user's recent cancellations
 */
async function fetchRecentCancellations(
  userId: string,
  facilityId: string
): Promise<BookingCancellation[]> {
  const result = await query(
    `SELECT
      id,
      booking_id as "bookingId",
      user_id as "userId",
      facility_id as "facilityId",
      cancelled_at as "cancelledAt",
      booking_start_time as "bookingStartTime",
      minutes_before_start as "minutesBeforeStart",
      is_late_cancel as "isLateCancel",
      strike_issued as "strikeIssued",
      strike_id as "strikeId",
      cancel_reason as "cancelReason"
    FROM booking_cancellations
    WHERE user_id = $1
      AND facility_id = $2
      AND cancelled_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
    ORDER BY cancelled_at DESC`,
    [userId, facilityId]
  );

  return result.rows;
}

/**
 * Fetch court blackouts for a specific date
 */
async function fetchCourtBlackouts(
  courtId: string,
  facilityId: string,
  bookingDate: string
): Promise<CourtBlackout[]> {
  const result = await query(
    `SELECT
      id,
      court_id as "courtId",
      facility_id as "facilityId",
      blackout_type as "blackoutType",
      title,
      description,
      start_datetime as "startDatetime",
      end_datetime as "endDatetime",
      recurrence_rule as "recurrenceRule",
      visibility,
      is_active as "isActive"
    FROM court_blackouts
    WHERE facility_id = $1
      AND is_active = true
      AND (court_id IS NULL OR court_id = $2)
      AND (
        (DATE(start_datetime) <= $3 AND DATE(end_datetime) >= $3)
        OR recurrence_rule IS NOT NULL
      )
    ORDER BY start_datetime`,
    [facilityId, courtId, bookingDate]
  );

  return result.rows;
}

/**
 * Build a minimal context for cancellation evaluation
 */
export async function buildCancellationContext(
  bookingId: string,
  userId: string
): Promise<{
  booking: BookingWithDetails;
  strikes: AccountStrike[];
  facility: FacilityWithRules;
}> {
  // Fetch booking
  const bookingResult = await query(
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
      COALESCE(b.is_prime_time, false) as "isPrimeTime",
      b.created_at as "createdAt",
      c.name as "courtName"
    FROM bookings b
    JOIN courts c ON b.court_id = c.id
    WHERE b.id = $1 AND b.user_id = $2`,
    [bookingId, userId]
  );

  if (bookingResult.rows.length === 0) {
    throw new Error(`Booking not found or unauthorized: ${bookingId}`);
  }

  const booking = bookingResult.rows[0];
  const facilityId = booking.facilityId;

  const [strikes, facility] = await Promise.all([
    fetchUserStrikes(userId, facilityId),
    fetchFacilityWithRules(facilityId)
  ]);

  return { booking, strikes, facility };
}
