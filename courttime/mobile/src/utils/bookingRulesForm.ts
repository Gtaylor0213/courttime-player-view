/**
 * Booking rules form: the same fields, defaults and save payload as the web
 * admin's Rules tab (useFacilityManagement). Rules live in the facility's
 * `bookingRules` JSON; the server's PATCH /admin/facilities/:id normalises it
 * and pushes the enforced copies into the rules engine.
 */

export interface PeakSlotRulesForm {
  maxBookingsPerDay: string;
  maxBookingsPerDayUnlimited: boolean;
  maxBookingsPerDayHousehold: string;
  maxBookingsPerDayHouseholdUnlimited: boolean;
  maxBookingsPerWeek: string;
  maxBookingsPerWeekUnlimited: boolean;
  maxBookingsPerWeekHousehold: string;
  maxBookingsPerWeekHouseholdUnlimited: boolean;
  maxDurationHours: string;
  maxDurationUnlimited: boolean;
}

export interface PeakSlotForm {
  id: string;
  startTime: string;
  endTime: string;
  days: number[];
  appliesToAllCourts: boolean;
  selectedCourtIds: string[];
  rules: PeakSlotRulesForm;
}

export interface BookingRulesForm {
  generalRules: string;
  restrictionType: 'account' | 'address';
  householdMaxMembersEnabled: boolean;
  householdMaxMembers: string;
  householdMaxActiveEnabled: boolean;
  householdMaxActive: string;
  courtsPerWeekUserEnabled: boolean;
  courtsPerWeekUser: string;
  courtsPerDayUserEnabled: boolean;
  courtsPerDayUser: string;
  courtsPerWeekHouseholdEnabled: boolean;
  courtsPerWeekHousehold: string;
  courtsPerDayHouseholdEnabled: boolean;
  courtsPerDayHousehold: string;
  daysInAdvanceEnabled: boolean;
  daysInAdvance: string;
  maxReservationDurationEnabled: boolean;
  /** Minutes, as a string (the field shows hours). */
  maxReservationDurationMinutes: string;
  maxReservationDurationByCourtTypeEnabled: boolean;
  maxReservationDurationTennisMinutes: string;
  maxReservationDurationPickleballMinutes: string;
  hasPeakHours: boolean;
  peakHoursSlots: PeakSlotForm[];
}

type Raw = Record<string, any>;

export const DEFAULT_PEAK_SLOT_RULES: PeakSlotRulesForm = {
  maxBookingsPerDay: '1',
  maxBookingsPerDayUnlimited: false,
  maxBookingsPerDayHousehold: '1',
  maxBookingsPerDayHouseholdUnlimited: false,
  maxBookingsPerWeek: '2',
  maxBookingsPerWeekUnlimited: false,
  maxBookingsPerWeekHousehold: '2',
  maxBookingsPerWeekHouseholdUnlimited: false,
  maxDurationHours: '1.5',
  maxDurationUnlimited: false,
};

const isUnlimited = (v: unknown) => v === -1 || v === '-1';
const ruleInput = (v: unknown, fallback: string) => (isUnlimited(v) || v == null || v === '' ? fallback : String(v));
const isPositive = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0;
};
/** First value that is not null/undefined, as a string. */
const firstString = (...values: unknown[]): string => {
  for (const v of values) if (v !== undefined && v !== null) return String(v);
  return '';
};
const firstBool = (...values: unknown[]): boolean | undefined => {
  for (const v of values) if (typeof v === 'boolean') return v;
  return undefined;
};

export function newPeakSlot(): PeakSlotForm {
  return {
    id: `slot-${Date.now()}`,
    startTime: '17:00',
    endTime: '20:00',
    days: [1, 2, 3, 4, 5],
    appliesToAllCourts: true,
    selectedCourtIds: [],
    rules: { ...DEFAULT_PEAK_SLOT_RULES },
  };
}

export function normalizePeakSlot(slot: Raw): PeakSlotForm {
  const r = slot?.rules ?? slot ?? {};
  const day = r.maxBookingsPerDay ?? r.max_bookings_per_day;
  const dayHh = r.maxBookingsPerDayHousehold ?? r.max_bookings_per_day_household;
  const week = r.maxBookingsPerWeek ?? r.max_bookings_per_week;
  const weekHh = r.maxBookingsPerWeekHousehold ?? r.max_bookings_per_week_household;
  const dur = r.maxDurationHours ?? r.max_duration_hours;
  return {
    id: slot.id || `slot-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    startTime: slot.startTime || slot.start_time || '17:00',
    endTime: slot.endTime || slot.end_time || '20:00',
    days: Array.isArray(slot.days) ? slot.days.filter((d: unknown) => typeof d === 'number') : [],
    appliesToAllCourts: slot.appliesToAllCourts !== false && slot.applies_to_all_courts !== false,
    selectedCourtIds: Array.isArray(slot.selectedCourtIds)
      ? slot.selectedCourtIds
      : Array.isArray(slot.selected_court_ids)
        ? slot.selected_court_ids
        : [],
    rules: {
      maxBookingsPerDay: ruleInput(day, DEFAULT_PEAK_SLOT_RULES.maxBookingsPerDay),
      maxBookingsPerDayUnlimited: r.maxBookingsPerDayUnlimited === true || isUnlimited(day),
      maxBookingsPerDayHousehold: ruleInput(dayHh, DEFAULT_PEAK_SLOT_RULES.maxBookingsPerDayHousehold),
      maxBookingsPerDayHouseholdUnlimited: r.maxBookingsPerDayHouseholdUnlimited === true || isUnlimited(dayHh),
      maxBookingsPerWeek: ruleInput(week, DEFAULT_PEAK_SLOT_RULES.maxBookingsPerWeek),
      maxBookingsPerWeekUnlimited: r.maxBookingsPerWeekUnlimited === true || isUnlimited(week),
      maxBookingsPerWeekHousehold: ruleInput(weekHh, DEFAULT_PEAK_SLOT_RULES.maxBookingsPerWeekHousehold),
      maxBookingsPerWeekHouseholdUnlimited: r.maxBookingsPerWeekHouseholdUnlimited === true || isUnlimited(weekHh),
      maxDurationHours: ruleInput(dur, DEFAULT_PEAK_SLOT_RULES.maxDurationHours),
      maxDurationUnlimited: r.maxDurationUnlimited === true || isUnlimited(dur),
    },
  };
}

/** The facility's saved bookingRules as an object ({} when unset or unparseable). */
export function parseRawBookingRules(bookingRules: unknown): Raw {
  if (!bookingRules) return {};
  try {
    const parsed = typeof bookingRules === 'string' ? JSON.parse(bookingRules) : bookingRules;
    return parsed && typeof parsed === 'object' ? (parsed as Raw) : {};
  } catch {
    return {};
  }
}

/** Minutes string for the duration field. Legacy payloads stored hours (e.g. "2") in the minutes key. */
function durationMinutes(rawMinutes: unknown, rawHours: unknown): string {
  if (isPositive(rawMinutes)) {
    const mins = Number(rawMinutes);
    return String(mins <= 12 ? Math.round(mins * 60) : Math.round(mins));
  }
  if (isPositive(rawHours)) return String(Math.round(Number(rawHours) * 60));
  return '';
}

const DAY_NAME_TO_NUMBER: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

/**
 * Form values from GET /api/facilities/:id. Flat keys win over the nested
 * shapes, then legacy keys — the same precedence the web admin uses.
 */
export function readBookingRulesForm(facility: Raw | null | undefined): BookingRulesForm {
  const raw = parseRawBookingRules(facility?.bookingRules);
  const limits = raw.userLimits ?? {};
  const nestedAdvance = raw.daysInAdvance && typeof raw.daysInAdvance === 'object' ? raw.daysInAdvance : null;
  const flatAdvance = raw.daysInAdvance != null && typeof raw.daysInAdvance !== 'object' ? raw.daysInAdvance : undefined;
  const nestedDuration = raw.maxReservationDuration && typeof raw.maxReservationDuration === 'object' ? raw.maxReservationDuration : null;

  const cap = (flatEnabled: unknown, flatValue: unknown, nested: Raw | undefined, legacyValue?: unknown) => ({
    enabled: firstBool(flatEnabled, nested?.enabled) ?? isPositive(flatValue ?? nested?.limit ?? legacyValue),
    value: firstString(flatValue, nested?.limit),
  });
  const weekUser = cap(raw.courtsPerWeekUserEnabled, raw.courtsPerWeekUser, limits.perWeekIndividual, raw.maxBookingsPerWeek);
  const dayUser = cap(raw.courtsPerDayUserEnabled, raw.courtsPerDayUser, limits.perDayIndividual);
  const weekHh = cap(raw.courtsPerWeekHouseholdEnabled, raw.courtsPerWeekHousehold, limits.perWeekHousehold);
  const dayHh = cap(raw.courtsPerDayHouseholdEnabled, raw.courtsPerDayHousehold, limits.perDayHousehold);

  const legacySlots = facility?.peakHoursPolicy?.timeSlots ?? [];
  const legacyPeakSlots: PeakSlotForm[] = Array.isArray(legacySlots)
    ? legacySlots.map((s: Raw) => normalizePeakSlot(s))
    : Object.entries(legacySlots as Record<string, unknown>).flatMap(([dayName, slots]) =>
        (Array.isArray(slots) ? slots : []).map((s: Raw) => normalizePeakSlot({ ...s, days: [DAY_NAME_TO_NUMBER[dayName]] }))
      );

  const advanceLimit = firstString(nestedAdvance?.limit, flatAdvance, raw.advanceBookingDays);

  return {
    generalRules: facility?.generalRules || raw.generalRules || '',
    restrictionType: (raw.restrictionType || facility?.restrictionType) === 'address' ? 'address' : 'account',
    householdMaxMembersEnabled: !!raw.householdMaxMembersEnabled,
    householdMaxMembers: firstString(raw.householdMaxMembers),
    householdMaxActiveEnabled: !!raw.householdMaxActiveEnabled,
    householdMaxActive: firstString(raw.householdMaxActive),
    courtsPerWeekUserEnabled: weekUser.enabled,
    courtsPerWeekUser: weekUser.value,
    courtsPerDayUserEnabled: dayUser.enabled,
    courtsPerDayUser: dayUser.value,
    courtsPerWeekHouseholdEnabled: weekHh.enabled,
    courtsPerWeekHousehold: weekHh.value,
    courtsPerDayHouseholdEnabled: dayHh.enabled,
    courtsPerDayHousehold: dayHh.value,
    daysInAdvanceEnabled:
      firstBool(raw.daysInAdvanceEnabled, nestedAdvance?.enabled) ??
      (typeof raw.advanceBookingDaysUnlimited === 'boolean' ? !raw.advanceBookingDaysUnlimited : isPositive(advanceLimit)),
    daysInAdvance: advanceLimit,
    maxReservationDurationEnabled:
      firstBool(raw.maxReservationDurationEnabled, nestedDuration?.enabled) ??
      (typeof raw.maxBookingDurationUnlimited === 'boolean'
        ? !raw.maxBookingDurationUnlimited
        : isPositive(raw.maxReservationDurationMinutes ?? nestedDuration?.limit ?? raw.maxBookingDurationHours)),
    maxReservationDurationMinutes: durationMinutes(
      raw.maxReservationDurationMinutes ?? nestedDuration?.limit,
      raw.maxBookingDurationHours
    ),
    maxReservationDurationByCourtTypeEnabled:
      firstBool(raw.maxReservationDurationByCourtTypeEnabled) ?? !!raw.maxReservationDurationByCourtType?.enabled,
    maxReservationDurationTennisMinutes: firstString(
      raw.maxReservationDurationTennisMinutes,
      raw.maxReservationDurationByCourtType?.tennisMinutes
    ),
    maxReservationDurationPickleballMinutes: firstString(
      raw.maxReservationDurationPickleballMinutes,
      raw.maxReservationDurationByCourtType?.pickleballMinutes
    ),
    hasPeakHours: !!raw.hasPeakHours,
    peakHoursSlots: Array.isArray(raw.peakHoursSlots)
      ? raw.peakHoursSlots.map((s: Raw) => normalizePeakSlot(s))
      : legacyPeakSlots,
  };
}

/** Same rule the web admin enforces before saving. Returns a message, or null when the form can be saved. */
export function validateBookingRulesForm(form: BookingRulesForm): string | null {
  if (form.daysInAdvanceEnabled) {
    const days = Number(String(form.daysInAdvance ?? '').trim());
    if (!Number.isInteger(days) || days < 1 || days > 365) {
      return 'Enter a days-in-advance value from 1 to 365, or turn that rule off.';
    }
  }
  return null;
}

/**
 * `bookingRules` body for PATCH /admin/facilities/:id. The server replaces the
 * stored JSON wholesale, so everything already saved is carried through and
 * the form's flat keys are laid on top (with the legacy aliases kept aligned).
 */
export function buildBookingRulesPayload(savedBookingRules: unknown, form: BookingRulesForm): Raw {
  return {
    ...parseRawBookingRules(savedBookingRules),
    ...form,
    maxBookingsPerWeek: form.courtsPerWeekUser,
    maxBookingsPerWeekUnlimited: !form.courtsPerWeekUserEnabled,
    advanceBookingDays: form.daysInAdvance,
    advanceBookingDaysUnlimited: !form.daysInAdvanceEnabled,
    restrictionsApplyToAdmins: false,
    peakHoursApplyToAdmins: false,
    weekendPolicyApplyToAdmins: false,
  };
}

/** Hours shown in a duration field for a minutes value ("90" → "1.5"). */
export function minutesToHoursInput(minutes: string): string {
  const n = Number(minutes);
  return Number.isFinite(n) && n > 0 ? String(n / 60) : '';
}

/** Minutes stored for an hours entry ("1.5" → "90"). Blank or invalid → "0", like the web field. */
export function hoursInputToMinutes(hours: string): string {
  const n = parseFloat(hours);
  return String(Number.isFinite(n) ? Math.round(n * 60) : 0);
}

/** "17:00" → "5:00 PM". */
export function formatTime12(time: string): string {
  const [hStr, m = '00'] = String(time).split(':');
  const h = parseInt(hStr, 10);
  if (!Number.isFinite(h)) return time;
  return `${h % 12 || 12}:${m.padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}
