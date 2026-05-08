/**
 * Account Rule Evaluators (ACC-001 to ACC-011)
 */

import { query } from '../../../database/connection';
import {
  RuleEvaluator,
  RuleContext,
  RuleResult,
  ACC001Config,
  ACC002Config,
  ACC003Config,
  ACC004Config,
  ACC005Config,
  ACC009Config,
  ACC010Config,
  ACC011Config
} from '../types';
import {
  getTimeWindow,
  formatDate,
  timeRangesOverlap,
  addDays,
  getDayOfWeek
} from '../utils/timeUtils';
import { resolveWeeklyIndividualFromBookingRules } from '../RuleContext';
import { countPrimeTimeBookings } from '../utils/primeTimeUtils';

function bookingMatchesPeakSlot(
  booking: { bookingDate: string; startTime: string; endTime: string; courtId: string; status: string },
  slot: RuleContext['activePeakHoursSlot']
): boolean {
  if (!slot || booking.status === 'cancelled') return false;
  const bookingDay = getDayOfWeek(booking.bookingDate);
  if (!slot.days.includes(bookingDay)) return false;
  if (!slot.appliesToAllCourts && !slot.selectedCourtIds.includes(booking.courtId)) return false;
  return timeRangesOverlap(booking.startTime, booking.endTime, slot.startTime, slot.endTime);
}

/**
 * ACC-001: Max Active Reservations
 */
const ACC001: RuleEvaluator = {
  ruleCode: 'ACC-001',
  ruleName: 'Max Active Reservations',
  category: 'account',

  async evaluate(context: RuleContext, config: ACC001Config): Promise<RuleResult> {
    const maxActive = context.user.tier?.maxActiveReservations
      ?? config.max_active_reservations
      ?? 999;

    const countStates = config.count_states || ['confirmed', 'pending'];

    // Count active reservations (future dates only)
    const today = formatDate(new Date());
    const activeCount = context.existingBookings.user.filter(b =>
      countStates.includes(b.status) && b.bookingDate >= today
    ).length;

    if (activeCount >= maxActive) {
      return {
        ruleCode: 'ACC-001',
        ruleName: 'Max Active Reservations',
        passed: false,
        severity: 'error',
        message: `You have reached the maximum of ${maxActive} active reservations. Cancel one to book another.`,
        details: { current: activeCount, max: maxActive }
      };
    }

    return { ruleCode: 'ACC-001', ruleName: 'Max Active Reservations', passed: true, severity: 'error' };
  }
};

/**
 * ACC-002: Max Reservations Per Week
 */
const ACC002: RuleEvaluator = {
  ruleCode: 'ACC-002',
  ruleName: 'Max Reservations Per Week',
  category: 'account',

  async evaluate(context: RuleContext, config: ACC002Config): Promise<RuleResult> {
    const resolved = resolveWeeklyIndividualFromBookingRules(context.facility);
    if (!resolved.enabled) {
      return { ruleCode: 'ACC-002', ruleName: 'Max Reservations Per Week', passed: true, severity: 'error' };
    }

    let maxPerWeek = resolved.limit > 0 ? resolved.limit : Number(config.max_per_week);

    if (!Number.isFinite(maxPerWeek) || maxPerWeek <= 0) {
      maxPerWeek = Number(context.user.tier?.maxReservationsPerWeek);
    }
    if (!Number.isFinite(maxPerWeek) || maxPerWeek <= 0) {
      maxPerWeek = 999;
    }

    const windowType = config.window_type || 'calendar_week';
    const includeCanceled = config.include_canceled || false;

    // Week for the reservation being validated (facility-local calendar date), not server UTC "now".
    const [by, bm, bd] = context.request.bookingDate.split('-').map(Number);
    const referenceDate = new Date(by, bm - 1, bd, 12, 0, 0, 0);

    const window = getTimeWindow(windowType, referenceDate);
    const windowStart = formatDate(window.startDate);
    const windowEnd = formatDate(window.endDate);

    const weeklyCount = context.existingBookings.user.filter(b => {
      if (b.bookingDate < windowStart || b.bookingDate > windowEnd) return false;
      if (!includeCanceled && b.status === 'cancelled') return false;
      return true;
    }).length;

    if (weeklyCount >= maxPerWeek) {
      const nextEligible = window.endDate;
      nextEligible.setDate(nextEligible.getDate() + 1);
      return {
        ruleCode: 'ACC-002',
        ruleName: 'Max Reservations Per Week',
        passed: false,
        severity: 'error',
        message: `Weekly booking limit reached (${weeklyCount}/${maxPerWeek}). Next eligible: ${formatDate(nextEligible)}.`,
        details: { current: weeklyCount, max: maxPerWeek, nextEligibleDate: formatDate(nextEligible) }
      };
    }

    return { ruleCode: 'ACC-002', ruleName: 'Max Reservations Per Week', passed: true, severity: 'error' };
  }
};

/**
 * ACC-003: Max Hours Per Week
 */
const ACC003: RuleEvaluator = {
  ruleCode: 'ACC-003',
  ruleName: 'Max Hours Per Week',
  category: 'account',

  async evaluate(context: RuleContext, config: ACC003Config): Promise<RuleResult> {
    const maxMinutes = context.user.tier?.maxMinutesPerWeek
      ?? config.max_minutes_per_week
      ?? 99999;

    const windowType = config.window_type || 'calendar_week';
    const window = getTimeWindow(windowType);
    const windowStart = formatDate(window.startDate);
    const windowEnd = formatDate(window.endDate);

    const currentMinutes = context.existingBookings.user
      .filter(b => b.bookingDate >= windowStart && b.bookingDate <= windowEnd && b.status !== 'cancelled')
      .reduce((sum, b) => sum + b.durationMinutes, 0);

    const newTotalMinutes = currentMinutes + context.request.durationMinutes;

    if (newTotalMinutes > maxMinutes) {
      return {
        ruleCode: 'ACC-003',
        ruleName: 'Max Hours Per Week',
        passed: false,
        severity: 'error',
        message: `Weekly hours limit would be exceeded (${newTotalMinutes}/${maxMinutes} minutes).`,
        details: { currentMinutes, maxMinutes, requestedMinutes: context.request.durationMinutes }
      };
    }

    return { ruleCode: 'ACC-003', ruleName: 'Max Hours Per Week', passed: true, severity: 'error' };
  }
};

/**
 * ACC-004: No Overlapping Reservations
 */
const ACC004: RuleEvaluator = {
  ruleCode: 'ACC-004',
  ruleName: 'No Overlapping Reservations',
  category: 'account',

  async evaluate(context: RuleContext, config: ACC004Config): Promise<RuleResult> {
    if (config.allow_overlap) {
      return { ruleCode: 'ACC-004', ruleName: 'No Overlapping Reservations', passed: true, severity: 'error' };
    }

    const graceMinutes = config.overlap_grace_minutes || 0;
    const { bookingDate, startTime, endTime } = context.request;

    // Check user's bookings on the same date
    const sameDay = context.existingBookings.user.filter(
      b => b.bookingDate === bookingDate && b.status !== 'cancelled'
    );

    for (const existing of sameDay) {
      if (timeRangesOverlap(startTime, endTime, existing.startTime, existing.endTime, graceMinutes)) {
        return {
          ruleCode: 'ACC-004',
          ruleName: 'No Overlapping Reservations',
          passed: false,
          severity: 'error',
          message: `This booking overlaps with your existing reservation on ${existing.courtName} at ${existing.startTime}.`,
          details: {
            otherReservationSummary: `${existing.courtName} at ${existing.startTime}`,
            existingBookingId: existing.id
          }
        };
      }
    }

    return { ruleCode: 'ACC-004', ruleName: 'No Overlapping Reservations', passed: true, severity: 'error' };
  }
};

/**
 * ACC-005: Advance Booking Window
 */
const ACC005: RuleEvaluator = {
  ruleCode: 'ACC-005',
  ruleName: 'Advance Booking Window',
  category: 'account',

  async evaluate(context: RuleContext, config: ACC005Config): Promise<RuleResult> {
    const maxDaysAhead = context.user.tier?.advanceBookingDays
      ?? config.max_days_ahead
      ?? 365;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const bookingDate = new Date(context.request.bookingDate);
    bookingDate.setHours(0, 0, 0, 0);

    const daysAhead = Math.ceil((bookingDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (daysAhead > maxDaysAhead) {
      const earliestAllowed = addDays(today, maxDaysAhead);

      return {
        ruleCode: 'ACC-005',
        ruleName: 'Advance Booking Window',
        passed: false,
        severity: 'error',
        message: `You can only book up to ${maxDaysAhead} days in advance.`,
        details: {
          maxDaysAhead,
          requestedDaysAhead: daysAhead,
          earliestAllowedDate: formatDate(earliestAllowed)
        }
      };
    }

    return { ruleCode: 'ACC-005', ruleName: 'Advance Booking Window', passed: true, severity: 'error' };
  }
};

/**
 * ACC-009: No-Show / Strike System
 */
const ACC009: RuleEvaluator = {
  ruleCode: 'ACC-009',
  ruleName: 'No-Show / Strike System',
  category: 'account',

  async evaluate(context: RuleContext, config: ACC009Config): Promise<RuleResult> {
    const threshold = config.strike_threshold || 3;
    const windowDays = config.strike_window_days || 30;
    const lockoutDays = config.lockout_days || 7;

    // Count active strikes within window
    const windowStart = new Date();
    windowStart.setDate(windowStart.getDate() - windowDays);

    const activeStrikes = context.strikes.filter(s => {
      const issuedAt = new Date(s.issuedAt);
      return issuedAt >= windowStart;
    });

    if (activeStrikes.length >= threshold) {
      // Calculate lockout end (based on most recent strike)
      const mostRecent = activeStrikes.reduce((latest, s) =>
        new Date(s.issuedAt) > new Date(latest.issuedAt) ? s : latest
      );
      const lockoutEnds = addDays(new Date(mostRecent.issuedAt), lockoutDays);

      if (lockoutEnds > context.currentDateTime) {
        return {
          ruleCode: 'ACC-009',
          ruleName: 'No-Show / Strike System',
          passed: false,
          severity: 'error',
          message: `Your account is temporarily locked due to ${activeStrikes.length} strikes. Lockout ends ${lockoutEnds.toLocaleDateString()}.`,
          details: {
            strikeCount: activeStrikes.length,
            threshold,
            lockoutEndsAt: formatDate(lockoutEnds)
          }
        };
      }
    }

    return { ruleCode: 'ACC-009', ruleName: 'No-Show / Strike System', passed: true, severity: 'error' };
  }
};

/**
 * ACC-010: Peak-Hours Reservations Per Week
 */
const ACC010: RuleEvaluator = {
  ruleCode: 'ACC-010',
  ruleName: 'Peak-Hours Reservations Per Week',
  category: 'account',

  async evaluate(context: RuleContext, config: ACC010Config): Promise<RuleResult> {
    // Only apply if booking is during peak hours
    if (!context.isPrimeTime) {
      return { ruleCode: 'ACC-010', ruleName: 'Peak-Hours Reservations Per Week', passed: true, severity: 'error' };
    }

    const windowType = config.window_type || 'calendar_week';
    const currentPrime = context.activePeakHoursSlot
      ? (() => {
          const window = getTimeWindow(windowType);
          const start = formatDate(window.startDate);
          const end = formatDate(window.endDate);
          return context.existingBookings.user.filter((booking) =>
            booking.bookingDate >= start &&
            booking.bookingDate <= end &&
            bookingMatchesPeakSlot(booking, context.activePeakHoursSlot)
          ).length;
        })()
      : countPrimeTimeBookings(context.existingBookings.user, windowType);
    const slotMaxPrime = context.activePeakHoursSlot?.rules?.maxBookingsPerWeek;
    if (slotMaxPrime === -1) {
      return { ruleCode: 'ACC-010', ruleName: 'Peak-Hours Reservations Per Week', passed: true, severity: 'error' };
    }
    const maxPrime = (slotMaxPrime !== undefined ? Number(slotMaxPrime) : undefined)
      ?? config.max_prime_per_week
      ?? context.user.tier?.primeTimeMaxPerWeek
      ?? 999;
    if (maxPrime === -1) {
      return { ruleCode: 'ACC-010', ruleName: 'Peak-Hours Reservations Per Week', passed: true, severity: 'error' };
    }

    if (currentPrime >= maxPrime) {
      return {
        ruleCode: 'ACC-010',
        ruleName: 'Peak-Hours Reservations Per Week',
        passed: false,
        severity: 'error',
        message: `Peak-hours weekly limit reached (${currentPrime}/${maxPrime}).`,
        details: { current: currentPrime, max: maxPrime }
      };
    }

    return { ruleCode: 'ACC-010', ruleName: 'Peak-Hours Reservations Per Week', passed: true, severity: 'error' };
  }
};

/**
 * ACC-011: Rate Limit Reservation Actions
 */
const ACC011: RuleEvaluator = {
  ruleCode: 'ACC-011',
  ruleName: 'Rate Limit Reservation Actions',
  category: 'account',

  async evaluate(context: RuleContext, config: ACC011Config): Promise<RuleResult> {
    const maxActions = config.max_actions || 10;
    const windowSeconds = config.window_seconds || 60;

    // Query rate limit table
    const result = await query(
      `SELECT COUNT(*) as count
       FROM booking_rate_limits
       WHERE user_id = $1
         AND facility_id = $2
         AND action_type = 'create'
         AND action_timestamp > NOW() - make_interval(secs => $3)`,
      [context.user.id, context.facility.id, windowSeconds]
    );

    const recentActions = parseInt(result.rows[0]?.count || '0', 10);

    if (recentActions >= maxActions) {
      return {
        ruleCode: 'ACC-011',
        ruleName: 'Rate Limit Reservation Actions',
        passed: false,
        severity: 'error',
        message: `Too many booking actions. Please wait ${windowSeconds} seconds before trying again.`,
        details: {
          recentActions,
          maxActions,
          retryAfterSeconds: windowSeconds
        }
      };
    }

    return { ruleCode: 'ACC-011', ruleName: 'Rate Limit Reservation Actions', passed: true, severity: 'error' };
  }
};

// Export all account evaluators
export const accountEvaluators: RuleEvaluator[] = [
  ACC001,
  ACC002,
  ACC003,
  ACC004,
  ACC005,
  ACC009,
  ACC010,
  ACC011
];
