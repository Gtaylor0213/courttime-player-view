/**
 * Pure helpers connecting HH-001 (max accounts per address) across
 * facility registration, booking_rules JSON, and facility_rule_configs.
 */

export interface HH001RuleEntry {
  enabled: boolean;
  config: {
    max_members?: number | string;
  };
}

export interface BookingRulesHH001Fields {
  householdMaxMembersEnabled: boolean;
  householdMaxMembers: string;
}

export interface HH001EngineRuleConfig {
  ruleCode: 'HH-001';
  isEnabled: boolean;
  ruleConfig: {
    max_members: number;
  };
}

/** Rules step / HH-001 toggle → facilities.booking_rules fields */
export function mapHH001RuleEntryToBookingRulesFields(
  entry: HH001RuleEntry
): BookingRulesHH001Fields {
  const maxRaw = entry.config?.max_members;
  const maxStr =
    maxRaw === undefined || maxRaw === null ? '' : String(maxRaw).trim();

  return {
    householdMaxMembersEnabled: !!entry.enabled,
    householdMaxMembers: entry.enabled ? maxStr : '',
  };
}

/** Facility Management booking_rules → rules engine bulk sync payload */
export function mapBookingRulesFieldsToHH001EngineConfig(
  bookingRules: BookingRulesHH001Fields
): HH001EngineRuleConfig {
  const parsed = parseInt(String(bookingRules.householdMaxMembers ?? ''), 10);
  const maxMembers = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;

  return {
    ruleCode: 'HH-001',
    isEnabled: !!bookingRules.householdMaxMembersEnabled,
    ruleConfig: { max_members: maxMembers },
  };
}

/** facility_rule_configs row + booking_rules fallback → enforcement config */
export function resolveHH001EnforcementConfig(input: {
  engineEnabled?: boolean;
  engineMaxMembers?: number | string | null;
  bookingRulesEnabled?: boolean;
  bookingRulesMaxMembers?: number | string | null;
}): { enabled: boolean; maxMembers: number | null } {
  if (input.engineEnabled !== undefined) {
    const parsed =
      input.engineMaxMembers === undefined ||
      input.engineMaxMembers === null ||
      String(input.engineMaxMembers).trim() === ''
        ? NaN
        : parseInt(String(input.engineMaxMembers), 10);
    const maxMembers = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    return {
      enabled: !!input.engineEnabled && maxMembers !== null,
      maxMembers: input.engineEnabled ? maxMembers : null,
    };
  }

  if (!input.bookingRulesEnabled) {
    return { enabled: false, maxMembers: null };
  }

  const parsed = parseInt(String(input.bookingRulesMaxMembers ?? ''), 10);
  const maxMembers = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  return {
    enabled: maxMembers !== null,
    maxMembers,
  };
}
