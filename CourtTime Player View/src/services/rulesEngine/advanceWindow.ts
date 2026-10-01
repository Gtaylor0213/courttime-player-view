/**
 * Days-in-advance (ACC-005) resolution shared by enforcement and the player-facing
 * booking-window endpoint, so the calendar shows exactly the window the engine enforces.
 */

import type { FacilityRuleConfig, RuleResult, SimplifiedBookingRules } from './types';
import {
  bookingWindowBlockedMessage,
  computeBookingCutoff,
  endsAfterBookingCutoff,
  formatCutoffLabel,
  type BookingCutoff,
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

/** Facility wall-clock date and hour (0–23) right now. */
export function getFacilityNowYmdHour(timeZone: string, instant: Date = new Date()): { ymd: string; hour: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '0';
  return {
    ymd: `${get('year')}-${get('month').padStart(2, '0')}-${get('day').padStart(2, '0')}`,
    hour: Number(get('hour')) % 24,
  };
}

/** Booking cutoff for a facility right now, or null when there is no limit. */
export function getFacilityBookingCutoff(
  timeZone: string,
  maxDaysAhead: number | null,
  instant: Date = new Date()
): BookingCutoff | null {
  if (maxDaysAhead == null) return null;
  const now = getFacilityNowYmdHour(timeZone, instant);
  return computeBookingCutoff(now.ymd, now.hour, maxDaysAhead);
}

/** Failing RuleResult when the reservation runs past the hourly cutoff, otherwise null. */
export function advanceWindowViolation(args: {
  ruleCode: string;
  ruleName: string;
  maxDaysAhead: number | null;
  timeZone: string;
  bookingYmd: string;
  startTime: string;
  endTime: string;
  now?: Date;
}): RuleResult | null {
  const cutoff = getFacilityBookingCutoff(args.timeZone, args.maxDaysAhead, args.now);
  if (!cutoff || args.maxDaysAhead == null) return null;
  if (!endsAfterBookingCutoff(args.bookingYmd, args.startTime, args.endTime, cutoff)) return null;

  return {
    ruleCode: args.ruleCode,
    ruleName: args.ruleName,
    passed: false,
    severity: 'error',
    message: bookingWindowBlockedMessage(args.maxDaysAhead, cutoff),
    details: {
      maxDaysAhead: args.maxDaysAhead,
      cutoffDate: cutoff.cutoffYmd,
      cutoffTime: cutoff.cutoffTime,
      cutoffLabel: formatCutoffLabel(cutoff),
    },
  };
}
