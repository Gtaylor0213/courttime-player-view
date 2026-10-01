/**
 * Days-in-advance (ACC-005) resolution shared by enforcement and the player-facing
 * booking-window endpoint, so the calendar shows exactly the window the engine enforces.
 */

import type { FacilityRuleConfig, RuleResult, SimplifiedBookingRules } from './types';
import {
  bookingWindowBlockedMessage,
  getLastBookableYmd,
  isBeyondBookingWindow,
  formatBookableDateLabel,
} from '../../../shared/utils/bookingWindow';

function positiveInt(v: unknown): number | null {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

/**
 * Effective max days ahead for a member, or null when unlimited.
 * An ACC-005 engine row wins; without one, the facility's booking_rules JSON applies.
 * A membership tier can only tighten the facility cap.
 */
export function resolveMaxDaysAhead(args: {
  acc005Rule?: Pick<FacilityRuleConfig, 'ruleConfig'> | null;
  simplified?: SimplifiedBookingRules;
  tierAdvanceBookingDays?: unknown;
}): number | null {
  let facilityCap: number | null = null;
  if (args.acc005Rule) {
    facilityCap = positiveInt(args.acc005Rule.ruleConfig?.max_days_ahead) ?? 365;
  } else if (args.simplified?.daysInAdvance?.enabled) {
    facilityCap = positiveInt(args.simplified.daysInAdvance.limit);
  }
  if (facilityCap == null) return null;

  const tierCap = positiveInt(args.tierAdvanceBookingDays);
  return tierCap != null ? Math.min(facilityCap, tierCap) : facilityCap;
}

/**
 * Max days ahead for one member at a facility. When the facility has an enabled ACC-005 row
 * it is authoritative (including when it is scoped away from this member's tier or court);
 * the booking_rules JSON is only the fallback for facilities without one.
 */
export function resolveMaxDaysAheadForMember(args: {
  facilityRules: FacilityRuleConfig[];
  simplified?: SimplifiedBookingRules;
  tier?: { id: string; advanceBookingDays?: unknown };
  courtId?: string;
}): number | null {
  const rows = args.facilityRules.filter((r) => r.ruleCode === 'ACC-005');
  if (rows.length === 0) {
    return resolveMaxDaysAhead({
      simplified: args.simplified,
      tierAdvanceBookingDays: args.tier?.advanceBookingDays,
    });
  }
  const applicable = rows.find((r) => {
    if (args.courtId && r.appliesToCourtIds?.length && !r.appliesToCourtIds.includes(args.courtId)) {
      return false;
    }
    if (r.appliesToTierIds?.length && args.tier && !r.appliesToTierIds.includes(args.tier.id)) {
      return false;
    }
    return true;
  });
  if (!applicable) return null;
  return resolveMaxDaysAhead({
    acc005Rule: applicable,
    tierAdvanceBookingDays: args.tier?.advanceBookingDays,
  });
}

/** Failing RuleResult when bookingYmd is past the window, otherwise null. */
export function advanceWindowViolation(args: {
  ruleCode: string;
  ruleName: string;
  maxDaysAhead: number | null;
  facilityTodayYmd: string;
  bookingYmd: string;
}): RuleResult | null {
  if (args.maxDaysAhead == null) return null;
  const lastBookableYmd = getLastBookableYmd(args.facilityTodayYmd, args.maxDaysAhead);
  if (!isBeyondBookingWindow(args.bookingYmd, lastBookableYmd)) return null;

  return {
    ruleCode: args.ruleCode,
    ruleName: args.ruleName,
    passed: false,
    severity: 'error',
    message: bookingWindowBlockedMessage(args.maxDaysAhead, lastBookableYmd),
    details: {
      maxDaysAhead: args.maxDaysAhead,
      lastBookableDate: lastBookableYmd,
      lastBookableLabel: formatBookableDateLabel(lastBookableYmd),
    },
  };
}
