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
  SimplifiedBookingRules,
  PeakHoursSlot,
  FacilityRuleConfig,
  HouseholdGroup,
  HouseholdMember,
  BookingWithDetails,
  AccountStrike,
  BookingCancellation
} from './types';
import { getDayOfWeek, timeRangesOverlap } from './utils/timeUtils';

function coerceRuleConfigRecord(config: unknown): Record<string, unknown> {
  if (config == null) return {};
  if (typeof config === 'string') {
    try {
      const p = JSON.parse(config);
      return p && typeof p === 'object' ? (p as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  if (typeof config === 'object') return config as Record<string, unknown>;
  return {};
}

function tryPositiveInt(v: unknown): number | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.floor(n);
}

/**
 * Copy snake_case booking_rules keys to camelCase when camel is missing (older APIs / manual JSON).
 */
function promoteSnakeCaseBookingRuleKeys(raw: Record<string, unknown>): void {
  const copyIfAbsent = (camel: string, snake: string) => {
    if (raw[camel] == null && raw[snake] != null) raw[camel] = raw[snake];
  };
  copyIfAbsent('courtsPerDayUser', 'courts_per_day_user');
  copyIfAbsent('courtsPerDayUserEnabled', 'courts_per_day_user_enabled');
  copyIfAbsent('courtsPerDayHousehold', 'courts_per_day_household');
  copyIfAbsent('courtsPerDayHouseholdEnabled', 'courts_per_day_household_enabled');
  copyIfAbsent('courtsPerWeekUser', 'courts_per_week_user');
  copyIfAbsent('maxBookingsPerWeek', 'max_bookings_per_week');
  copyIfAbsent('courtsPerWeekUserEnabled', 'courts_per_week_user_enabled');
  copyIfAbsent('maxBookingsPerWeekUnlimited', 'max_bookings_per_week_unlimited');
  copyIfAbsent('courtsPerWeekHousehold', 'courts_per_week_household');
  copyIfAbsent('maxBookingsPerWeekHousehold', 'max_bookings_per_week_household');
  copyIfAbsent('courtsPerWeekHouseholdEnabled', 'courts_per_week_household_enabled');
  copyIfAbsent('maxBookingsPerWeekHouseholdUnlimited', 'max_bookings_per_week_household_unlimited');

  if (raw.userLimits == null && raw.user_limits != null && typeof raw.user_limits === 'object') {
    raw.userLimits = raw.user_limits;
  }
  const ul = raw.userLimits as Record<string, unknown> | undefined;
  if (ul && typeof ul === 'object') {
    copyNested(ul, 'perWeekIndividual', 'per_week_individual');
    copyNested(ul, 'perWeekHousehold', 'per_week_household');
    copyNested(ul, 'perDayIndividual', 'per_day_individual');
    copyNested(ul, 'perDayHousehold', 'per_day_household');
  }
}

function copyNested(parent: Record<string, unknown>, camel: string, snake: string): void {
  if (parent[camel] == null && parent[snake] != null) parent[camel] = parent[snake];
}

/**
 * When the modern flat field `courtsPerWeekUser` is present, force nested userLimits to match so
 * stale nested values cannot override what the admin saved.
 *
 * If `courtsPerWeekUser` is absent (legacy JSON), do not copy `maxBookingsPerWeek` into nested:
 * that field is often stale (default "2") while nested `userLimits.perWeekIndividual` was the
 * real configured limit — overwriting nested with 2 caused players to see the wrong weekly cap.
 */
function alignNestedWeeklyIndividualFromFlat(raw: Record<string, unknown>): void {
  const fromUser = tryPositiveInt(raw.courtsPerWeekUser);
  const fromMax = tryPositiveInt(raw.maxBookingsPerWeek);
  const limit =
    fromUser !== undefined
      ? fromUser
      : 'courtsPerWeekUser' in raw
        ? fromMax
        : undefined;
  if (limit === undefined) return;

  let enabled: boolean | undefined;
  if (raw.courtsPerWeekUserEnabled !== undefined && raw.courtsPerWeekUserEnabled !== null) {
    enabled = !!raw.courtsPerWeekUserEnabled;
  } else if (raw.maxBookingsPerWeekUnlimited !== undefined && raw.maxBookingsPerWeekUnlimited !== null) {
    enabled = !raw.maxBookingsPerWeekUnlimited;
  }

  const userLimits = (raw.userLimits || {}) as Record<string, unknown>;
  const prev = (userLimits.perWeekIndividual || {}) as Record<string, unknown>;
  userLimits.perWeekIndividual = {
    ...prev,
    limit,
    ...(enabled !== undefined ? { enabled } : {}),
  };
  raw.userLimits = userLimits;
}

function alignNestedDailyIndividualFromFlat(raw: Record<string, unknown>): void {
  const limit = tryPositiveInt(raw.courtsPerDayUser);
  if (limit === undefined) return;

  let enabled: boolean | undefined;
  if (raw.courtsPerDayUserEnabled !== undefined && raw.courtsPerDayUserEnabled !== null) {
    enabled = !!raw.courtsPerDayUserEnabled;
  }

  const userLimits = (raw.userLimits || {}) as Record<string, unknown>;
  const prev = (userLimits.perDayIndividual || {}) as Record<string, unknown>;
  userLimits.perDayIndividual = {
    ...prev,
    limit,
    ...(enabled !== undefined ? { enabled } : {}),
  };
  raw.userLimits = userLimits;
}

/**
 * Resolves "Courts Per Week (Individual)" from raw `facilities.booking_rules`.
 * Uses `courtsPerWeekUser` when set, then nested `userLimits.perWeekIndividual`, then legacy
 * `maxBookingsPerWeek` (often stale defaults) and ACC-002.
 */
export function resolveWeeklyIndividualFromBookingRules(facility: {
  simplifiedBookingRules?: SimplifiedBookingRules;
  bookingRulesRaw?: Record<string, unknown> | null;
  rules?: FacilityRuleConfig[];
}): { enabled: boolean; limit: number } {
  const raw = facility.bookingRulesRaw;
  const norm = facility.simplifiedBookingRules;
  const acc002 = facility.rules?.find((r) => r.ruleCode === 'ACC-002');
  const acc002Cfg = acc002?.isEnabled ? coerceRuleConfigRecord(acc002.ruleConfig) : {};
  const engineLimit = tryPositiveInt(acc002Cfg.max_per_week);

  let enabled = !!norm?.userLimits?.perWeekIndividual?.enabled;
  let limit =
    tryPositiveInt(norm?.userLimits?.perWeekIndividual?.limit) ?? 0;

  let rawSpecifiedEnabled = false;

  if (raw && typeof raw === 'object') {
    if (raw.courtsPerWeekUserEnabled !== undefined && raw.courtsPerWeekUserEnabled !== null) {
      enabled = !!raw.courtsPerWeekUserEnabled;
      rawSpecifiedEnabled = true;
    } else if (raw.maxBookingsPerWeekUnlimited !== undefined && raw.maxBookingsPerWeekUnlimited !== null) {
      enabled = !raw.maxBookingsPerWeekUnlimited;
      rawSpecifiedEnabled = true;
    } else {
      const nestedEn = (raw.userLimits as Record<string, unknown> | undefined)?.perWeekIndividual as
        | { enabled?: unknown }
        | undefined;
      if (nestedEn && nestedEn.enabled !== undefined && nestedEn.enabled !== null) {
        enabled = !!nestedEn.enabled;
        rawSpecifiedEnabled = true;
      }
    }

    const fromFlatUser = tryPositiveInt(raw.courtsPerWeekUser);
    const fromFlatMax = tryPositiveInt(raw.maxBookingsPerWeek);
    const nestedLim = tryPositiveInt(
      ((raw.userLimits as Record<string, unknown> | undefined)?.perWeekIndividual as { limit?: unknown } | undefined)?.limit
    );
    // Primary admin field first, then nested (authoritative when legacy maxBookingsPerWeek is stale), then legacy flat / engine.
    const resolved = fromFlatUser ?? nestedLim ?? fromFlatMax ?? engineLimit;
    if (resolved !== undefined) {
      limit = resolved;
    }
  } else {
    const fromEngineOnly = engineLimit;
    if (fromEngineOnly !== undefined) {
      limit = fromEngineOnly;
    }
  }

  if (!rawSpecifiedEnabled && acc002?.isEnabled) {
    enabled = true;
  }

  return { enabled, limit };
}

export function resolveDailyIndividualFromBookingRules(facility: {
  simplifiedBookingRules?: SimplifiedBookingRules;
  bookingRulesRaw?: Record<string, unknown> | null;
}): { enabled: boolean; limit: number } {
  const raw = facility.bookingRulesRaw;
  const norm = facility.simplifiedBookingRules;

  let enabled = !!norm?.userLimits?.perDayIndividual?.enabled;
  let limit = tryPositiveInt(norm?.userLimits?.perDayIndividual?.limit) ?? 0;

  if (raw && typeof raw === 'object') {
    if (raw.courtsPerDayUserEnabled !== undefined && raw.courtsPerDayUserEnabled !== null) {
      enabled = !!raw.courtsPerDayUserEnabled;
    } else {
      const nestedEn = (raw.userLimits as Record<string, unknown> | undefined)?.perDayIndividual as
        | { enabled?: unknown }
        | undefined;
      if (nestedEn && nestedEn.enabled !== undefined && nestedEn.enabled !== null) {
        enabled = !!nestedEn.enabled;
      }
    }

    const fromFlatUser = tryPositiveInt(raw.courtsPerDayUser);
    const nestedLim = tryPositiveInt(
      ((raw.userLimits as Record<string, unknown> | undefined)?.perDayIndividual as { limit?: unknown } | undefined)?.limit
    );
    const resolved = fromFlatUser ?? nestedLim;
    if (resolved !== undefined) {
      limit = resolved;
    }
  }

  return { enabled, limit };
}

const ALLOWED_RULE_CODES = [
  'ACC-002',
  'ACC-005',
  'CRT-005',
  'ACC-010',
  'CRT-001',
  'CRT-002',
  'HH-003'
] as const;

/**
 * Get current time expressed as facility-local components.
 * On servers running in UTC (e.g., Render), new Date() is UTC but booking
 * times are stored as facility-local (e.g., "16:00" means 4 PM EST).
 * This function returns a Date whose year/month/day/hour/minute match the
 * facility's current local time, so comparisons with combineDateAndTime work correctly.
 */
export function getFacilityLocalNow(timezone: string): Date {
  const now = new Date();
  // Format current time in the facility's timezone
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const get = (type: string) => {
    const part = parts.find(p => p.type === type);
    return part ? parseInt(part.value, 10) : 0;
  };

  return new Date(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second')
  );
}

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
    blackouts,
    peakHoursSlots
  ] = await Promise.all([
    fetchUserWithTier(request.userId, request.facilityId),
    fetchCourtWithConfig(request.courtId),
    fetchFacilityWithRules(request.facilityId),
    fetchUserHousehold(request.userId, request.facilityId),
    fetchUserBookings(request.userId, request.facilityId),
    fetchCourtBookings(request.courtId, request.bookingDate),
    fetchUserStrikes(request.userId, request.facilityId),
    fetchRecentCancellations(request.userId, request.facilityId),
    fetchCourtBlackouts(request.courtId, request.facilityId, request.bookingDate),
    fetchPeakHoursSlots(request.facilityId)
  ]);

  // Fetch household bookings if household exists
  let householdBookings: BookingWithDetails[] = [];
  if (household) {
    householdBookings = await fetchHouseholdBookings(household.id);
  }

  const slotsFromRuleEngine = extractPeakHoursSlotsFromRuleConfigs(facility.rules || []);
  const combinedPeakHoursSlots = mergePeakHoursSlots(peakHoursSlots, slotsFromRuleEngine);

  const activePeakHoursSlot = findApplicablePeakHoursSlot(
    combinedPeakHoursSlots,
    request.courtId,
    request.bookingDate,
    request.startTime,
    request.endTime
  );
  // Fall back to legacy court operating config peak-hours when no slot policy is configured.
  const dayOfWeek = getDayOfWeek(request.bookingDate);
  const dayConfig = court.operatingConfig?.find(c => c.dayOfWeek === dayOfWeek);
  const isLegacyPrime = Boolean(
    dayConfig?.primeTimeStart &&
    dayConfig?.primeTimeEnd &&
    timeRangesOverlap(request.startTime, request.endTime, dayConfig.primeTimeStart, dayConfig.primeTimeEnd)
  );
  const bookingIsPrimeTime = Boolean(activePeakHoursSlot || isLegacyPrime);

  // Use facility-local time for currentDateTime so comparisons with
  // combineDateAndTime (which uses local time components) are correct
  // even when the server runs in UTC (e.g., Render)
  const facilityTimezone = (facility as any).timezone || 'America/New_York';
  const currentDateTime = getFacilityLocalNow(facilityTimezone);

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
    currentDateTime,
    isPrimeTime: bookingIsPrimeTime,
    peakHoursSlots: combinedPeakHoursSlots,
    activePeakHoursSlot: activePeakHoursSlot || undefined
  };
}

function findApplicablePeakHoursSlot(
  slots: PeakHoursSlot[],
  courtId: string,
  bookingDate: string,
  startTime: string,
  endTime: string
): PeakHoursSlot | null {
  const day = getDayOfWeek(bookingDate);
  return (
    slots.find((slot) => {
      if (!slot.days.includes(day)) return false;
      if (!slot.appliesToAllCourts && !slot.selectedCourtIds.includes(courtId)) return false;
      return timeRangesOverlap(startTime, endTime, slot.startTime, slot.endTime);
    }) || null
  );
}

function normalizePeakHoursSlots(rawConfig: any): PeakHoursSlot[] {
  const timeSlots = rawConfig?.time_slots;
  if (!timeSlots) return [];

  // New model: slots[] with days array.
  if (Array.isArray(timeSlots)) {
    return timeSlots.map((slot: any) => ({
      id: String(slot.id || `${slot.startTime || slot.start_time}-${slot.endTime || slot.end_time}`),
      startTime: slot.startTime || slot.start_time,
      endTime: slot.endTime || slot.end_time,
      days: Array.isArray(slot.days)
        ? slot.days.map((d: any) => Number(d)).filter((d: number) => Number.isInteger(d) && d >= 0 && d <= 6)
        : [],
      appliesToAllCourts: slot.appliesToAllCourts !== false && slot.applies_to_all_courts !== false,
      selectedCourtIds: Array.isArray(slot.selectedCourtIds)
        ? slot.selectedCourtIds
        : (Array.isArray(slot.selected_court_ids) ? slot.selected_court_ids : []),
      rules: {
        maxBookingsPerDay: toOptionalNumber(slot.rules?.maxBookingsPerDay ?? slot.rules?.max_bookings_per_day),
        maxBookingsPerWeek: toOptionalNumber(slot.rules?.maxBookingsPerWeek ?? slot.rules?.max_bookings_per_week),
        maxBookingsPerWeekHousehold: toOptionalNumber(slot.rules?.maxBookingsPerWeekHousehold ?? slot.rules?.max_bookings_per_week_household),
        maxDurationHours: toOptionalNumber(slot.rules?.maxDurationHours ?? slot.rules?.max_duration_hours),
      }
    })).filter((slot: PeakHoursSlot) => slot.startTime && slot.endTime && slot.days.length > 0);
  }

  // Legacy model: Record<dayName, slots[]>
  if (typeof timeSlots === 'object') {
    const dayNameToNumber: Record<string, number> = {
      sunday: 0,
      monday: 1,
      tuesday: 2,
      wednesday: 3,
      thursday: 4,
      friday: 5,
      saturday: 6
    };
    const normalized: PeakHoursSlot[] = [];
    for (const [dayName, slots] of Object.entries(timeSlots)) {
      const day = dayNameToNumber[dayName.toLowerCase()];
      if (day === undefined || !Array.isArray(slots)) continue;
      for (const slot of slots as any[]) {
        normalized.push({
          id: String(slot.id || `${dayName}-${slot.startTime || slot.start_time}-${slot.endTime || slot.end_time}`),
          startTime: slot.startTime || slot.start_time,
          endTime: slot.endTime || slot.end_time,
          days: [day],
          appliesToAllCourts: slot.appliesToAllCourts !== false && slot.applies_to_all_courts !== false,
          selectedCourtIds: Array.isArray(slot.selectedCourtIds)
            ? slot.selectedCourtIds
            : (Array.isArray(slot.selected_court_ids) ? slot.selected_court_ids : []),
          rules: {
            maxBookingsPerDay: toOptionalNumber(slot.rules?.maxBookingsPerDay ?? slot.rules?.max_bookings_per_day),
            maxBookingsPerWeek: toOptionalNumber(slot.rules?.maxBookingsPerWeek ?? slot.rules?.max_bookings_per_week),
            maxBookingsPerWeekHousehold: toOptionalNumber(slot.rules?.maxBookingsPerWeekHousehold ?? slot.rules?.max_bookings_per_week_household),
            maxDurationHours: toOptionalNumber(slot.rules?.maxDurationHours ?? slot.rules?.max_duration_hours),
          }
        });
      }
    }
    return normalized.filter((slot) => slot.startTime && slot.endTime && slot.days.length > 0);
  }

  return [];
}

async function fetchPeakHoursSlots(facilityId: string): Promise<PeakHoursSlot[]> {
  const result = await query(
    `SELECT rule_config as "ruleConfig"
     FROM facility_rules
     WHERE facility_id = $1
       AND rule_type = 'peak_hours'
       AND is_active = true
     ORDER BY created_at DESC
     LIMIT 1`,
    [facilityId]
  );

  if (result.rows.length === 0) {
    return [];
  }

  const rawConfig = result.rows[0].ruleConfig;
  return normalizePeakHoursSlots(typeof rawConfig === 'string' ? JSON.parse(rawConfig) : rawConfig);
}

function toOptionalNumber(value: any): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function extractPeakHoursSlotsFromRuleConfigs(rules: FacilityRuleConfig[]): PeakHoursSlot[] {
  const crt001 = rules.find((r) => r.ruleCode === 'CRT-001');
  if (!crt001?.ruleConfig) return [];
  const windows = (crt001.ruleConfig.peak_windows || crt001.ruleConfig.prime_windows || []) as any[];
  if (!Array.isArray(windows)) return [];

  return windows.map((w: any) => ({
    id: String(w.id || `${w.start_time}-${w.end_time}`),
    startTime: w.start_time || w.startTime,
    endTime: w.end_time || w.endTime,
    days: Array.isArray(w.days)
      ? w.days.map((d: any) => Number(d)).filter((d: number) => Number.isInteger(d) && d >= 0 && d <= 6)
      : (typeof w.day_of_week === 'number' ? [w.day_of_week] : []),
    appliesToAllCourts: w.applies_to_all_courts !== false && w.appliesToAllCourts !== false,
    selectedCourtIds: Array.isArray(w.selected_court_ids)
      ? w.selected_court_ids
      : (Array.isArray(w.selectedCourtIds) ? w.selectedCourtIds : []),
    rules: {
      maxBookingsPerDay: toOptionalNumber(w.rules?.max_bookings_per_day ?? w.rules?.maxBookingsPerDay),
      maxBookingsPerWeek: toOptionalNumber(w.rules?.max_bookings_per_week ?? w.rules?.maxBookingsPerWeek),
      maxBookingsPerWeekHousehold: toOptionalNumber(w.rules?.max_bookings_per_week_household ?? w.rules?.maxBookingsPerWeekHousehold),
      maxDurationHours: toOptionalNumber(w.rules?.max_duration_hours ?? w.rules?.maxDurationHours),
    }
  })).filter((slot) => slot.startTime && slot.endTime && slot.days.length > 0);
}

function mergePeakHoursSlots(primary: PeakHoursSlot[], fallback: PeakHoursSlot[]): PeakHoursSlot[] {
  const merged = new Map<string, PeakHoursSlot>();
  for (const slot of [...fallback, ...primary]) {
    const key = `${slot.id}:${slot.startTime}:${slot.endTime}:${slot.days.join(',')}`;
    merged.set(key, slot);
  }
  return Array.from(merged.values());
}

function normalizeSimplifiedBookingRules(raw: any): SimplifiedBookingRules | undefined {
  if (!raw || typeof raw !== 'object') return undefined;

  const normalizeDurationLimit = (value: any, fallback: number): number => {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return fallback;
    // Legacy payloads may store hour-like values in this field (e.g. "2" means 2 hours).
    return n <= 12 ? Math.round(n * 60) : Math.round(n);
  };
  const toNumber = (value: any, fallback: number): number => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  };
  const pickNumber = (primary: any, secondary: any, fallback: number): number => {
    const p = Number(primary);
    if (Number.isFinite(p)) return p;
    const s = Number(secondary);
    if (Number.isFinite(s)) return s;
    return fallback;
  };
  /** Prefer primary admin field, then nested JSON, then legacy flat — avoids stale maxBookingsPerWeek defaulting to 2. */
  const firstPositiveLimit = (...candidates: any[]): number => {
    for (const v of candidates) {
      if (v === undefined || v === null || v === '') continue;
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) return Math.floor(n);
    }
    return 0;
  };
  const pickEnabled = (preferred: any, legacyEnabled: any, legacyUnlimited: any, fallback: boolean): boolean => {
    if (preferred !== undefined && preferred !== null) return !!preferred;
    if (legacyEnabled !== undefined && legacyEnabled !== null) return !!legacyEnabled;
    if (legacyUnlimited !== undefined && legacyUnlimited !== null) return !legacyUnlimited;
    return fallback;
  };

  // Merge both shapes so newer admin fields override stale nested values.
  const existingDaysInAdvance = raw.daysInAdvance || {};
  const existingCancellationPolicy = raw.cancellationPolicy || {};
  const existingMaxReservationDuration = raw.maxReservationDuration || {};
  const existingUserLimits = raw.userLimits || {};
  const existingPerWeekIndividual = existingUserLimits.perWeekIndividual || {};
  const existingPerWeekHousehold = existingUserLimits.perWeekHousehold || {};
  const existingPerDayIndividual = existingUserLimits.perDayIndividual || {};
  const existingPerDayHousehold = existingUserLimits.perDayHousehold || {};

  // Admin booking management stores a flat shape; older saves may be nested-only under userLimits/daysInAdvance.
  const hasFlatShape =
    'maxReservationDurationEnabled' in raw ||
    'maxReservationDurationMinutes' in raw ||
    'daysInAdvanceEnabled' in raw ||
    'courtsPerWeekUserEnabled' in raw;

  const hasNestedNormalizedShape =
    !!raw.userLimits &&
    typeof raw.userLimits === 'object' &&
    (raw.daysInAdvance !== undefined ||
      raw.maxReservationDuration !== undefined ||
      Object.keys(raw.userLimits).length > 0);

  if (!hasFlatShape && hasNestedNormalizedShape) {
    return {
      restrictionType: raw.restrictionType === 'address' ? 'address' : 'account',
      daysInAdvance: {
        enabled: !!existingDaysInAdvance.enabled,
        limit: toNumber(existingDaysInAdvance.limit, 14),
      },
      cancellationPolicy: {
        enabled: !!existingCancellationPolicy.enabled,
      },
      maxReservationDuration: {
        enabled: !!existingMaxReservationDuration.enabled,
        limit: normalizeDurationLimit(existingMaxReservationDuration.limit, 120),
      },
      userLimits: {
        perWeekIndividual: {
          enabled: !!existingPerWeekIndividual.enabled,
          limit: toNumber(existingPerWeekIndividual.limit, 0),
        },
        perWeekHousehold: {
          enabled: !!existingPerWeekHousehold.enabled,
          limit: toNumber(existingPerWeekHousehold.limit, 0),
        },
        perDayIndividual: {
          enabled: !!existingPerDayIndividual.enabled,
          limit: toNumber(existingPerDayIndividual.limit, 0),
        },
        perDayHousehold: {
          enabled: !!existingPerDayHousehold.enabled,
          limit: toNumber(existingPerDayHousehold.limit, 0),
        },
      },
      hasPeakHours: !!raw.hasPeakHours,
      peakHoursSlots: Array.isArray(raw.peakHoursSlots) ? raw.peakHoursSlots : [],
    };
  }

  if (!hasFlatShape) return undefined;

  const toNum = (v: any, fallback: number): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };

  return {
    restrictionType: raw.restrictionType === 'address' ? 'address' : 'account',
    daysInAdvance: {
      enabled: pickEnabled(
        raw.daysInAdvanceEnabled,
        existingDaysInAdvance.enabled,
        raw.advanceBookingDaysUnlimited,
        false
      ),
      limit: pickNumber(raw.daysInAdvance, raw.advanceBookingDays, toNumber(existingDaysInAdvance.limit, 14))
    },
    cancellationPolicy: {
      enabled: raw.cancellationPolicyEnabled !== undefined
        ? !!raw.cancellationPolicyEnabled
        : !!existingCancellationPolicy.enabled
    },
    maxReservationDuration: {
      enabled: pickEnabled(
        raw.maxReservationDurationEnabled,
        existingMaxReservationDuration.enabled,
        raw.maxBookingDurationUnlimited,
        false
      ),
      limit: normalizeDurationLimit(
        raw.maxReservationDurationMinutes,
        pickNumber(existingMaxReservationDuration.limit, raw.maxBookingDurationHours, 120)
      )
    },
    userLimits: {
      perWeekIndividual: {
        enabled: pickEnabled(
          raw.courtsPerWeekUserEnabled !== undefined ? raw.courtsPerWeekUserEnabled : existingPerWeekIndividual.enabled,
          raw.maxBookingsPerWeekUnlimited !== undefined ? !raw.maxBookingsPerWeekUnlimited : undefined,
          undefined,
          false
        ),
        limit:
          firstPositiveLimit(
            raw.courtsPerWeekUser,
            existingPerWeekIndividual.limit,
            raw.maxBookingsPerWeek
          ) || toNumber(existingPerWeekIndividual.limit, 0)
      },
      perWeekHousehold: {
        enabled: raw.courtsPerWeekHouseholdEnabled !== undefined
          ? !!raw.courtsPerWeekHouseholdEnabled
          : !!existingPerWeekHousehold.enabled,
        limit: pickNumber(raw.maxBookingsPerWeekHousehold, raw.courtsPerWeekHousehold, toNumber(existingPerWeekHousehold.limit, 0))
      },
      perDayIndividual: {
        enabled: raw.courtsPerDayUserEnabled !== undefined
          ? !!raw.courtsPerDayUserEnabled
          : !!existingPerDayIndividual.enabled,
        limit:
          firstPositiveLimit(raw.courtsPerDayUser, existingPerDayIndividual.limit) ||
          toNumber(existingPerDayIndividual.limit, 0)
      },
      perDayHousehold: {
        enabled: raw.courtsPerDayHouseholdEnabled !== undefined
          ? !!raw.courtsPerDayHouseholdEnabled
          : !!existingPerDayHousehold.enabled,
        limit: toNumber(raw.courtsPerDayHousehold !== undefined ? raw.courtsPerDayHousehold : existingPerDayHousehold.limit, 0)
      }
    },
    hasPeakHours: !!raw.hasPeakHours,
    peakHoursSlots: Array.isArray(raw.peakHoursSlots) ? raw.peakHoursSlots : []
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
      COALESCE(fm.is_facility_admin, false) OR EXISTS(
        SELECT 1 FROM facility_admins fa
        WHERE fa.user_id = u.id AND fa.facility_id = $2 AND fa.status = 'active'
      ) as "isFacilityAdmin",
      fm.status as "membershipStatus",
      fm.suspended_until as "suspendedUntil",
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

  // Auto-reactivate expired suspensions
  let membershipStatus = row.membershipStatus || undefined;
  let suspendedUntil = row.suspendedUntil || null;

  if (membershipStatus === 'suspended' && suspendedUntil && new Date(suspendedUntil) <= new Date()) {
    membershipStatus = 'active';
    suspendedUntil = null;
    // Update DB in background (fire-and-forget)
    query(
      `UPDATE facility_memberships SET status = 'active', suspended_until = NULL
       WHERE user_id = $1 AND facility_id = $2 AND status = 'suspended'
         AND suspended_until IS NOT NULL AND suspended_until <= NOW()`,
      [userId, facilityId]
    ).catch(err => console.error('Failed to auto-reactivate member:', err));
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
    isFacilityAdmin: row.isFacilityAdmin || false,
    membershipStatus,
    suspendedUntil
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
      operating_hours as "operatingHours",
      booking_rules as "bookingRules",
      timezone,
      status
    FROM facilities
    WHERE id = $1`,
    [facilityId]
  );

  if (facilityResult.rows.length === 0) {
    throw new Error(`Facility not found: ${facilityId}`);
  }

  const facility = facilityResult.rows[0];
  let simplifiedBookingRules: SimplifiedBookingRules | undefined;
  let bookingRulesRaw: Record<string, unknown> | null = null;
  if (facility.bookingRules) {
    try {
      const parsed = typeof facility.bookingRules === 'string'
        ? JSON.parse(facility.bookingRules)
        : facility.bookingRules;
      if (parsed && typeof parsed === 'object') {
        const rawObj = parsed as Record<string, unknown>;
        promoteSnakeCaseBookingRuleKeys(rawObj);
        alignNestedWeeklyIndividualFromFlat(rawObj);
        alignNestedDailyIndividualFromFlat(rawObj);
        bookingRulesRaw = rawObj;
      }
      simplifiedBookingRules = normalizeSimplifiedBookingRules(parsed);
    } catch (error) {
      console.warn('Failed to parse facility booking_rules JSON:', error);
    }
  }

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
    WHERE frc.facility_id = $1
      AND frc.is_enabled = true
      AND brd.rule_code = ANY($2::text[])
    ORDER BY brd.evaluation_order, frc.priority`,
    [facilityId, ALLOWED_RULE_CODES]
  );

  // Fetch default tier
  const defaultTier = await fetchDefaultTier(facilityId);

  return {
    id: facility.id,
    name: facility.name,
    operatingHours: facility.operatingHours,
    timezone: facility.timezone,
    status: facility.status || 'active',
    bookingRulesRaw,
    simplifiedBookingRules,
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
      AND b.booking_date >= CURRENT_DATE - INTERVAL '21 days'
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
      AND b.booking_date >= CURRENT_DATE - INTERVAL '21 days'
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
