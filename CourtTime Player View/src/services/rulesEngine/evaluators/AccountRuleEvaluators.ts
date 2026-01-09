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
  ACC006Config,
  ACC007Config,
  ACC009Config,
  ACC010Config,
  ACC011Config
} from '../types';
import {
  getTimeWindow,
  formatDate,
  combineDateAndTime,
  minutesBetween,
  timeRangesOverlap,
  addDays
} from '../utils/timeUtils';
import { countPrimeTimeBookings } from '../utils/primeTimeUtils';

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
    const maxPerWeek = context.user.tier?.maxReservationsPerWeek
      ?? config.max_per_week
      ?? 999;

    const windowType = config.window_type || 'calendar_week';
    const includeCanceled = config.include_canceled || false;

    const window = getTimeWindow(windowType);
    const windowStart = formatDate(window.startDate);
    const windowEnd = formatDate(window.endDate);

    const weeklyCount = context.existingBookings.user.filter(b => {
      if (b.bookingDate < windowStart || b.bookingDate > windowEnd) return false;
      if (!includeCanceled && b.status === 'cancelled') return false;
      return true;
    }).length;

    if (weeklyCount >= maxPerWeek) {
      return {
        ruleCode: 'ACC-002',
        ruleName: 'Max Reservations Per Week',
        passed: false,
        severity: 'error',
        message: `Weekly booking limit reached (${weeklyCount}/${maxPerWeek}).`,
        details: { current: weeklyCount, max: maxPerWeek }
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
 * ACC-006: Minimum Lead Time
 */
const ACC006: RuleEvaluator = {
  ruleCode: 'ACC-006',
  ruleName: 'Minimum Lead Time',
  category: 'account',

  async evaluate(context: RuleContext, config: ACC006Config): Promise<RuleResult> {
    const minMinutes = config.min_minutes_before_start || 15;

    const bookingStart = combineDateAndTime(context.request.bookingDate, context.request.startTime);
    const minutesUntilStart = minutesBetween(context.currentDateTime, bookingStart);

    if (minutesUntilStart < minMinutes) {
      return {
        ruleCode: 'ACC-006',
        ruleName: 'Minimum Lead Time',
        passed: false,
        severity: 'error',
        message: `Reservations must be made at least ${minMinutes} minutes before start time.`,
        details: { minMinutes, minutesUntilStart }
      };
    }

    return { ruleCode: 'ACC-006', ruleName: 'Minimum Lead Time', passed: true, severity: 'error' };
  }
};

/**
 * ACC-007: Cancellation Cooldown
 */
const ACC007: RuleEvaluator = {
  ruleCode: 'ACC-007',
  ruleName: 'Cancellation Cooldown',
  category: 'account',

  async evaluate(context: RuleContext, config: ACC007Config): Promise<RuleResult> {
    const cooldownMinutes = config.cooldown_minutes || 30;
    const onlyIfWithin = config.only_if_within_minutes_of_start;

    // Check recent cancellations
    const recentCancel = context.recentCancellations.find(c => {
      // If onlyIfWithin is set, only consider cancellations that were within X minutes of start
      if (onlyIfWithin && c.minutesBeforeStart > onlyIfWithin) {
        return false;
      }

      // Check if within cooldown period
      const cancelledAt = new Date(c.cancelledAt);
      const minutesSinceCancel = minutesBetween(cancelledAt, context.currentDateTime);
      return minutesSinceCancel < cooldownMinutes;
    });

    if (recentCancel) {
      const cancelledAt = new Date(recentCancel.cancelledAt);
      const cooldownEnds = new Date(cancelledAt.getTime() + cooldownMinutes * 60 * 1000);

      return {
        ruleCode: 'ACC-007',
        ruleName: 'Cancellation Cooldown',
        passed: false,
        severity: 'error',
        message: `You recently canceled a reservation. You can book again after ${cooldownEnds.toLocaleTimeString()}.`,
        details: {
          cooldownMinutes,
          cooldownEndsAt: cooldownEnds.toISOString(),
          lastCancellation: recentCancel.cancelledAt
        }
      };
    }

    return { ruleCode: 'ACC-007', ruleName: 'Cancellation Cooldown', passed: true, severity: 'error' };
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
 * ACC-010: Prime-Time Reservations Per Week
 */
const ACC010: RuleEvaluator = {
  ruleCode: 'ACC-010',
  ruleName: 'Prime-Time Reservations Per Week',
  category: 'account',

  async evaluate(context: RuleContext, config: ACC010Config): Promise<RuleResult> {
    // Only apply if booking is during prime time
    if (!context.isPrimeTime) {
      return { ruleCode: 'ACC-010', ruleName: 'Prime-Time Reservations Per Week', passed: true, severity: 'error' };
    }

    const maxPrime = context.user.tier?.primeTimeMaxPerWeek
      ?? config.max_prime_per_week
      ?? 999;

    const windowType = config.window_type || 'calendar_week';
    const currentPrime = countPrimeTimeBookings(context.existingBookings.user, windowType);

    if (currentPrime >= maxPrime) {
      return {
        ruleCode: 'ACC-010',
        ruleName: 'Prime-Time Reservations Per Week',
        passed: false,
        severity: 'error',
        message: `Prime-time weekly limit reached (${currentPrime}/${maxPrime}).`,
        details: { current: currentPrime, max: maxPrime }
      };
    }

    return { ruleCode: 'ACC-010', ruleName: 'Prime-Time Reservations Per Week', passed: true, severity: 'error' };
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
         AND action_timestamp > NOW() - INTERVAL '${windowSeconds} seconds'`,
      [context.user.id, context.facility.id]
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
  ACC006,
  ACC007,
  ACC009,
  ACC010,
  ACC011
];
