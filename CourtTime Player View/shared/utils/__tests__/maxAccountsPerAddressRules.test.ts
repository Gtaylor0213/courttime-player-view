import { describe, expect, it } from 'vitest';
import {
  mapBookingRulesFieldsToHH001EngineConfig,
  mapHH001RuleEntryToBookingRulesFields,
  resolveHH001EnforcementConfig,
} from '../maxAccountsPerAddressRules';

describe('maxAccountsPerAddressRules — UI ↔ storage mapping', () => {
  it('maps enabled HH-001 rule entry to booking_rules fields', () => {
    expect(
      mapHH001RuleEntryToBookingRulesFields({
        enabled: true,
        config: { max_members: 4 },
      })
    ).toEqual({
      householdMaxMembersEnabled: true,
      householdMaxMembers: '4',
    });
  });

  it('maps disabled HH-001 rule entry to off / empty booking_rules fields', () => {
    expect(
      mapHH001RuleEntryToBookingRulesFields({
        enabled: false,
        config: { max_members: 4 },
      })
    ).toEqual({
      householdMaxMembersEnabled: false,
      householdMaxMembers: '',
    });
  });

  it('maps booking_rules fields to HH-001 engine config for sync', () => {
    expect(
      mapBookingRulesFieldsToHH001EngineConfig({
        householdMaxMembersEnabled: true,
        householdMaxMembers: '4',
      })
    ).toEqual({
      ruleCode: 'HH-001',
      isEnabled: true,
      ruleConfig: { max_members: 4 },
    });
  });

  it('defaults engine max_members to 1 when enabled but value missing', () => {
    expect(
      mapBookingRulesFieldsToHH001EngineConfig({
        householdMaxMembersEnabled: true,
        householdMaxMembers: '',
      })
    ).toEqual({
      ruleCode: 'HH-001',
      isEnabled: true,
      ruleConfig: { max_members: 1 },
    });
  });

  it('round-trips registration rule entry → booking_rules → engine config', () => {
    const entry = { enabled: true, config: { max_members: 6 } };
    const bookingFields = mapHH001RuleEntryToBookingRulesFields(entry);
    const engine = mapBookingRulesFieldsToHH001EngineConfig(bookingFields);

    expect(engine).toEqual({
      ruleCode: 'HH-001',
      isEnabled: true,
      ruleConfig: { max_members: 6 },
    });
  });
});

describe('resolveHH001EnforcementConfig', () => {
  it('prefers facility_rule_configs when present', () => {
    expect(
      resolveHH001EnforcementConfig({
        engineEnabled: true,
        engineMaxMembers: 4,
        bookingRulesEnabled: false,
        bookingRulesMaxMembers: '99',
      })
    ).toEqual({ enabled: true, maxMembers: 4 });
  });

  it('falls back to booking_rules when engine row absent', () => {
    expect(
      resolveHH001EnforcementConfig({
        bookingRulesEnabled: true,
        bookingRulesMaxMembers: '3',
      })
    ).toEqual({ enabled: true, maxMembers: 3 });
  });

  it('treats disabled / empty as unlimited', () => {
    expect(resolveHH001EnforcementConfig({ bookingRulesEnabled: false })).toEqual({
      enabled: false,
      maxMembers: null,
    });
    expect(
      resolveHH001EnforcementConfig({ engineEnabled: false, engineMaxMembers: 4 })
    ).toEqual({ enabled: false, maxMembers: null });
  });
});
