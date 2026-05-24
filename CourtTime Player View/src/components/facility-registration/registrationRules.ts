import type { RuleEntry, RulesConfig } from './rule-defaults';

export function getRuleEntry(rulesConfig: RulesConfig, ruleCode: string): RuleEntry {
  return rulesConfig.rules[ruleCode] || { enabled: false, config: {} };
}

export function hasValue(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === 'number' && !Number.isFinite(value)) return false;
  return String(value).trim() !== '';
}

function toStringOrBlank(value: unknown): string {
  return hasValue(value) ? String(value).trim() : '';
}

function formatHoursFromMinutes(value: unknown): string {
  const minutes = Number(value);
  if (!Number.isFinite(minutes) || minutes <= 0) return '';
  const hours = minutes / 60;
  return Number.isInteger(hours) ? String(hours) : String(Math.round(hours * 100) / 100);
}

export function buildRegistrationBookingRules(rulesConfig: RulesConfig) {
  const daysInAdvanceRule = getRuleEntry(rulesConfig, 'ACC-005');
  const maxReservationDurationRule = getRuleEntry(rulesConfig, 'CRT-005');
  const weeklyIndividualRule = getRuleEntry(rulesConfig, 'ACC-002');
  const maxAccountsPerAddressRule = getRuleEntry(rulesConfig, 'HH-001');
  const householdRule = getRuleEntry(rulesConfig, 'HH-003');

  const daysInAdvance = daysInAdvanceRule.enabled
    ? toStringOrBlank(daysInAdvanceRule.config.max_days_ahead)
    : '';
  const maxReservationDurationMinutes = maxReservationDurationRule.enabled
    ? toStringOrBlank(maxReservationDurationRule.config.max_duration_minutes)
    : '';
  const courtsPerWeekUser = weeklyIndividualRule.enabled
    ? toStringOrBlank(weeklyIndividualRule.config.max_per_week)
    : '';
  const courtsPerDayUserEnabled = !!weeklyIndividualRule.config.max_per_day_enabled;
  const courtsPerDayUser = courtsPerDayUserEnabled
    ? toStringOrBlank(weeklyIndividualRule.config.max_per_day)
    : '';
  const courtsPerWeekHousehold = householdRule.enabled
    ? toStringOrBlank(
        householdRule.config.max_per_week_household ?? householdRule.config.max_prime_per_week_household
      )
    : '';
  const courtsPerDayHouseholdEnabled = !!householdRule.config.max_per_day_household_enabled;
  const courtsPerDayHousehold = courtsPerDayHouseholdEnabled
    ? toStringOrBlank(householdRule.config.max_per_day_household)
    : '';
  const householdMaxMembers = maxAccountsPerAddressRule.enabled
    ? toStringOrBlank(maxAccountsPerAddressRule.config.max_members)
    : '';

  return {
    generalRules: rulesConfig.generalRules,
    restrictionType: rulesConfig.restrictionType,
    householdMaxMembersEnabled: !!maxAccountsPerAddressRule.enabled,
    householdMaxMembers,
    daysInAdvanceEnabled: !!daysInAdvanceRule.enabled,
    daysInAdvance,
    maxReservationDurationEnabled: !!maxReservationDurationRule.enabled,
    maxReservationDurationMinutes,
    courtsPerWeekUserEnabled: !!weeklyIndividualRule.enabled,
    courtsPerWeekUser,
    courtsPerWeekHouseholdEnabled: !!householdRule.enabled,
    courtsPerWeekHousehold,
    courtsPerDayUserEnabled,
    courtsPerDayUser,
    courtsPerDayHouseholdEnabled,
    courtsPerDayHousehold,
    maxBookingsPerWeek: courtsPerWeekUser,
    maxBookingsPerWeekUnlimited: !weeklyIndividualRule.enabled,
    maxBookingDurationHours: formatHoursFromMinutes(maxReservationDurationMinutes),
    maxBookingDurationUnlimited: !maxReservationDurationRule.enabled,
    advanceBookingDays: daysInAdvance,
    advanceBookingDaysUnlimited: !daysInAdvanceRule.enabled,
    restrictionsApplyToAdmins: false,
    adminMaxBookingsPerWeek: '',
    adminMaxBookingsUnlimited: true,
    adminMaxBookingDurationHours: '',
    adminMaxDurationUnlimited: true,
    adminAdvanceBookingDays: '',
    adminAdvanceBookingUnlimited: true,
    hasPeakHours: rulesConfig.hasPeakHours,
    peakHoursApplyToAdmins: false,
    peakHoursSlots: rulesConfig.peakHoursSlots,
    peakHoursRestrictions: {
      maxBookingsPerWeek: '',
      maxBookingsUnlimited: true,
      maxDurationHours: '',
      maxDurationUnlimited: true,
    },
    hasWeekendPolicy: rulesConfig.hasWeekendPolicy,
    weekendPolicyApplyToAdmins: false,
    weekendPolicy: {
      maxBookingsPerWeekend: '',
      maxBookingsUnlimited: true,
      maxDurationHours: '',
      maxDurationUnlimited: true,
      advanceBookingDays: '',
      advanceBookingUnlimited: true,
    },
  };
}
