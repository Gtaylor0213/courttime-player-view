/**
 * Household Rule Evaluators (HH-001 to HH-003)
 */

import {
  RuleEvaluator,
  RuleContext,
  RuleResult,
  HH001Config,
  HH002Config,
  HH003Config
} from '../types';
import {
  countHouseholdActiveBookings,
  countHouseholdPrimeTimeBookings,
  countHouseholdMembers
} from '../utils/householdUtils';
import {
  coerceDayOfWeekList,
  formatDate,
  getDayOfWeek,
  getTimeWindow,
  timeRangesOverlap
} from '../utils/timeUtils';

function householdBookingMatchesPeakSlot(
  booking: { bookingDate: string; startTime: string; endTime: string; courtId: string; status: string },
  slot: RuleContext['activePeakHoursSlot']
): boolean {
  if (!slot || booking.status === 'cancelled') return false;
  const bookingDay = getDayOfWeek(booking.bookingDate);
  if (!coerceDayOfWeekList(slot.days).includes(bookingDay)) return false;
  if (!slot.appliesToAllCourts && !slot.selectedCourtIds.includes(booking.courtId)) return false;
  return timeRangesOverlap(booking.startTime, booking.endTime, slot.startTime, slot.endTime);
}

/**
 * HH-001: Max Members Per Address
 * Note: This is evaluated during user registration/household join, not booking
 */
const HH001: RuleEvaluator = {
  ruleCode: 'HH-001',
  ruleName: 'Max Members Per Address',
  category: 'household',

  async evaluate(context: RuleContext, config: HH001Config): Promise<RuleResult> {
    // This rule is not evaluated during booking - it's for registration
    // We check it anyway for informational purposes
    if (!context.household) {
      return { ruleCode: 'HH-001', ruleName: 'Max Members Per Address', passed: true, severity: 'warning' };
    }

    const maxMembers = context.household.maxMembers || config.max_members || 6;
    const currentMembers = countHouseholdMembers(context.household);

    // This shouldn't block booking, just inform
    if (currentMembers >= maxMembers) {
      return {
        ruleCode: 'HH-001',
        ruleName: 'Max Members Per Address',
        passed: true, // Don't block bookings
        severity: 'warning',
        message: `Your household has reached the maximum of ${maxMembers} members.`,
        details: { current: currentMembers, max: maxMembers }
      };
    }

    return { ruleCode: 'HH-001', ruleName: 'Max Members Per Address', passed: true, severity: 'warning' };
  }
};

/**
 * HH-002: Household Max Active Reservations
 */
const HH002: RuleEvaluator = {
  ruleCode: 'HH-002',
  ruleName: 'Household Max Active Reservations',
  category: 'household',

  async evaluate(context: RuleContext, config: HH002Config): Promise<RuleResult> {
    if (!context.household) {
      return { ruleCode: 'HH-002', ruleName: 'Household Max Active Reservations', passed: true, severity: 'error' };
    }

    const maxActive = context.household.maxActiveReservations || config.max_active_household || 999;
    const currentActive = countHouseholdActiveBookings(context.existingBookings.household);

    if (currentActive >= maxActive) {
      return {
        ruleCode: 'HH-002',
        ruleName: 'Household Max Active Reservations',
        passed: false,
        severity: 'error',
        message: `Your household has reached its active reservation limit (${currentActive}/${maxActive}).`,
        details: {
          current: currentActive,
          max: maxActive,
          householdName: context.household.householdName || context.household.streetAddress
        }
      };
    }

    return { ruleCode: 'HH-002', ruleName: 'Household Max Active Reservations', passed: true, severity: 'error' };
  }
};

/**
 * HH-003: Household Peak-Hours Cap
 */
const HH003: RuleEvaluator = {
  ruleCode: 'HH-003',
  ruleName: 'Household Peak-Hours Cap',
  category: 'household',

  async evaluate(context: RuleContext, config: HH003Config): Promise<RuleResult> {
    // Only apply if booking is during peak hours
    if (!context.isPrimeTime) {
      return { ruleCode: 'HH-003', ruleName: 'Household Peak-Hours Cap', passed: true, severity: 'error' };
    }

    if (!context.household) {
      return { ruleCode: 'HH-003', ruleName: 'Household Peak-Hours Cap', passed: true, severity: 'error' };
    }

    const windowType = config.window_type || 'calendar_week';
    const currentPrime = context.activePeakHoursSlot
      ? (() => {
          const window = getTimeWindow(windowType);
          const start = formatDate(window.startDate);
          const end = formatDate(window.endDate);
          return context.existingBookings.household.filter((booking) =>
            booking.bookingDate >= start &&
            booking.bookingDate <= end &&
            householdBookingMatchesPeakSlot(booking, context.activePeakHoursSlot)
          ).length;
        })()
      : countHouseholdPrimeTimeBookings(context.existingBookings.household, windowType);
    const slotMaxPrime = context.activePeakHoursSlot?.rules?.maxBookingsPerWeekHousehold;
    if (slotMaxPrime === -1) {
      return { ruleCode: 'HH-003', ruleName: 'Household Peak-Hours Cap', passed: true, severity: 'error' };
    }
    const maxPrime = (slotMaxPrime !== undefined ? Number(slotMaxPrime) : undefined)
      || config.max_prime_per_week_household
      || context.household.primeTimeMaxPerWeek
      || 999;
    if (maxPrime === -1) {
      return { ruleCode: 'HH-003', ruleName: 'Household Peak-Hours Cap', passed: true, severity: 'error' };
    }

    if (currentPrime >= maxPrime) {
      return {
        ruleCode: 'HH-003',
        ruleName: 'Household Peak-Hours Cap',
        passed: false,
        severity: 'error',
        message: `Your household has reached its peak-hours weekly limit (${currentPrime}/${maxPrime}).`,
        details: {
          current: currentPrime,
          max: maxPrime,
          householdName: context.household.householdName || context.household.streetAddress
        }
      };
    }

    return { ruleCode: 'HH-003', ruleName: 'Household Peak-Hours Cap', passed: true, severity: 'error' };
  }
};

// Export all household evaluators
export const householdEvaluators: RuleEvaluator[] = [
  HH001,
  HH002,
  HH003
];
