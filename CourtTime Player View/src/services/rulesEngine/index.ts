/**
 * CourtTime Booking Rules Engine
 * Main entry point for rule evaluation
 */

import { query } from '../../database/connection';
import { buildRuleContext, buildCancellationContext, getFacilityLocalNow } from './RuleContext';
import {
  BookingRequest,
  CancellationRequest,
  RuleContext,
  RuleResult,
  EvaluationResult,
  CancellationEvaluationResult,
  AdminOverride,
  FacilityRuleConfig,
  RuleEvaluator
} from './types';
import { combineDateAndTime, formatDate, getDayOfWeek, minutesBetween, timeRangesOverlap, timeToMinutes } from './utils/timeUtils';

// Import evaluators
import { accountEvaluators } from './evaluators/AccountRuleEvaluators';
import { courtEvaluators } from './evaluators/CourtRuleEvaluators';
import { householdEvaluators } from './evaluators/HouseholdRuleEvaluators';

/**
 * Main Rules Engine class
 */
export class RulesEngine {
  private evaluators: Map<string, RuleEvaluator>;

  constructor() {
    this.evaluators = new Map();
    this.registerEvaluators();
  }

  /**
   * Register all rule evaluators
   */
  private registerEvaluators(): void {
    // Register account evaluators
    for (const evaluator of accountEvaluators) {
      this.evaluators.set(evaluator.ruleCode, evaluator);
    }

    // Register court evaluators
    for (const evaluator of courtEvaluators) {
      this.evaluators.set(evaluator.ruleCode, evaluator);
    }

    // Register household evaluators
    for (const evaluator of householdEvaluators) {
      this.evaluators.set(evaluator.ruleCode, evaluator);
    }
  }

  /**
   * Main evaluation method - called before booking creation
   * Evaluation order: Court -> Account -> Household
   *
   * NOTE: This method fails gracefully if the rules engine tables don't exist.
   * When tables are missing, it returns allowed=true to let bookings proceed.
   */
  async evaluate(request: BookingRequest): Promise<EvaluationResult> {
    try {
      // Build context (fetch user, court, facility, existing bookings, etc.)
      const context = await buildRuleContext(request);

      // === Pre-rule hard blocks (facility, membership, court status) ===

      // Block if facility is not active
      const facilityStatus = context.facility.status || 'active';
      if (facilityStatus === 'suspended' || facilityStatus === 'closed') {
        const statusLabel = facilityStatus === 'suspended' ? 'temporarily suspended' : 'permanently closed';
        return {
          allowed: false,
          results: [],
          blockers: [{
            ruleCode: 'SYS-FACILITY',
            ruleName: 'Facility Status',
            passed: false,
            severity: 'error',
            message: `${context.facility.name} is ${statusLabel} and is not accepting reservations at this time.`
          }],
          warnings: [],
          isPrimeTime: false
        };
      }
      if (facilityStatus === 'pending') {
        return {
          allowed: false,
          results: [],
          blockers: [{
            ruleCode: 'SYS-FACILITY',
            ruleName: 'Facility Status',
            passed: false,
            severity: 'error',
            message: `${context.facility.name} is still being set up and is not yet accepting reservations.`
          }],
          warnings: [],
          isPrimeTime: false
        };
      }

      // Block if member is suspended or expired
      const memberStatus = context.user.membershipStatus;
      if (memberStatus === 'suspended') {
        const suspendedUntil = context.user.suspendedUntil;
        const untilMsg = suspendedUntil
          ? ` until ${new Date(suspendedUntil).toLocaleDateString()}`
          : '';
        return {
          allowed: false,
          results: [],
          blockers: [{
            ruleCode: 'SYS-MEMBER',
            ruleName: 'Membership Status',
            passed: false,
            severity: 'error',
            message: `Your membership at ${context.facility.name} is suspended${untilMsg}. Please contact the facility for assistance.`
          }],
          warnings: [],
          isPrimeTime: false
        };
      }
      if (memberStatus === 'expired') {
        return {
          allowed: false,
          results: [],
          blockers: [{
            ruleCode: 'SYS-MEMBER',
            ruleName: 'Membership Status',
            passed: false,
            severity: 'error',
            message: `Your membership at ${context.facility.name} has expired. Please renew your membership to make reservations.`
          }],
          warnings: [],
          isPrimeTime: false
        };
      }
      if (memberStatus === 'pending') {
        return {
          allowed: false,
          results: [],
          blockers: [{
            ruleCode: 'SYS-MEMBER',
            ruleName: 'Membership Status',
            passed: false,
            severity: 'error',
            message: `Your membership at ${context.facility.name} is pending approval. You cannot make reservations until your membership is approved.`
          }],
          warnings: [],
          isPrimeTime: false
        };
      }

      // Block if court is in maintenance or closed
      const courtStatus = context.court.status;
      if (courtStatus === 'maintenance') {
        return {
          allowed: false,
          results: [],
          blockers: [{
            ruleCode: 'SYS-COURT',
            ruleName: 'Court Status',
            passed: false,
            severity: 'error',
            message: `${context.court.name} is currently under maintenance and not available for booking.`
          }],
          warnings: [],
          isPrimeTime: false
        };
      }
      if (courtStatus === 'closed') {
        return {
          allowed: false,
          results: [],
          blockers: [{
            ruleCode: 'SYS-COURT',
            ruleName: 'Court Status',
            passed: false,
            severity: 'error',
            message: `${context.court.name} is closed and not available for booking.`
          }],
          warnings: [],
          isPrimeTime: false
        };
      }

      // === End pre-rule hard blocks ===

      // Facility admins bypass all booking rules automatically
      if (context.user.isFacilityAdmin) {
        return {
          allowed: true,
          results: [],
          blockers: [],
          warnings: [],
          isPrimeTime: context.isPrimeTime
        };
      }

      const simplifiedResult = this.evaluateSimplifiedRules(context);
      if (simplifiedResult) {
        return simplifiedResult;
      }

      // Get applicable rules for this facility/court/tier
      const rules = this.getApplicableRules(context);

      const results: RuleResult[] = [];

      // Group rules by category
      const courtRules = rules.filter(r => r.ruleCategory === 'court');
      const accountRules = rules.filter(r => r.ruleCategory === 'account');
      const householdRules = rules.filter(r => r.ruleCategory === 'household');

      // Evaluate court rules first (CRT-*)
      for (const rule of courtRules) {
        const result = await this.evaluateRule(rule, context);
        if (result) results.push(result);
      }

      // Evaluate account rules second (ACC-*)
      for (const rule of accountRules) {
        const result = await this.evaluateRule(rule, context);
        if (result) results.push(result);
      }

      // Evaluate household rules last (HH-*) - only if household exists
      if (context.household) {
        for (const rule of householdRules) {
          const result = await this.evaluateRule(rule, context);
          if (result) results.push(result);
        }
      }

      // Compile final result
      const blockers = results.filter(r => !r.passed && r.severity === 'error');
      const warnings = results.filter(r => !r.passed && r.severity === 'warning');

      return {
        allowed: blockers.length === 0,
        results,
        blockers,
        warnings,
        isPrimeTime: context.isPrimeTime
      };
    } catch (error: any) {
      // Gracefully handle missing tables - allow booking to proceed
      // This enables the app to work before migration is run
      if (error?.code === '42P01') { // PostgreSQL "relation does not exist" error
        console.warn('Rules engine tables not found. Skipping rule validation. Run migration 007_booking_rules_engine.sql to enable rules.');
        return {
          allowed: true,
          results: [],
          blockers: [],
          warnings: [{
            ruleCode: 'SYSTEM',
            ruleName: 'Rules Engine',
            passed: false,
            severity: 'warning',
            message: 'Rule validation skipped - rules engine not configured'
          }],
          isPrimeTime: false
        };
      }
      // Re-throw other errors
      console.error('Error in rules engine evaluation:', error);
      throw error;
    }
  }

  private evaluateSimplifiedRules(context: RuleContext): EvaluationResult | null {
    const config = context.facility.simplifiedBookingRules;
    if (!config) return null;

    const blockers: RuleResult[] = [];
    const nowDate = new Date(context.currentDateTime);
    const requestDate = new Date(context.request.bookingDate);
    requestDate.setHours(0, 0, 0, 0);
    nowDate.setHours(0, 0, 0, 0);

    if (config.daysInAdvance?.enabled) {
      const maxDaysAhead = Number(config.daysInAdvance.limit) || 0;
      const daysAhead = Math.ceil((requestDate.getTime() - nowDate.getTime()) / (1000 * 60 * 60 * 24));
      if (daysAhead > maxDaysAhead) {
        blockers.push({
          ruleCode: 'SIMPLE-ADVANCE',
          ruleName: 'Days in Advance',
          passed: false,
          severity: 'error',
          message: `You can only book up to ${maxDaysAhead} days in advance`
        });
      }
    }

    const dayOfWeek = getDayOfWeek(context.request.bookingDate);
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayName = dayNames[dayOfWeek];
    const facilityHours = config.facilityHours?.[dayName] || context.facility.operatingHours?.[dayName];
    if (facilityHours) {
      if ((facilityHours as any).isOpen === false || (facilityHours as any).closed === true) {
        blockers.push({
          ruleCode: 'SIMPLE-FACILITY-HOURS',
          ruleName: 'Facility Hours',
          passed: false,
          severity: 'error',
          message: 'This facility is not open during the selected time'
        });
      } else if ((facilityHours as any).open && (facilityHours as any).close) {
        const requestStart = timeToMinutes(context.request.startTime);
        const requestEnd = timeToMinutes(context.request.endTime);
        const open = timeToMinutes((facilityHours as any).open);
        const close = timeToMinutes((facilityHours as any).close);
        if (requestStart < open || requestEnd > close) {
          blockers.push({
            ruleCode: 'SIMPLE-FACILITY-HOURS',
            ruleName: 'Facility Hours',
            passed: false,
            severity: 'error',
            message: 'This facility is not open during the selected time'
          });
        }
      }
    }

    const courtDayConfig = context.court.operatingConfig?.find(c => c.dayOfWeek === dayOfWeek);
    if (courtDayConfig) {
      if (!courtDayConfig.isOpen) {
        blockers.push({
          ruleCode: 'SIMPLE-COURT-HOURS',
          ruleName: 'Court Hours',
          passed: false,
          severity: 'error',
          message: 'This court is not available during the selected time'
        });
      } else if (courtDayConfig.openTime && courtDayConfig.closeTime) {
        const requestStart = timeToMinutes(context.request.startTime);
        const requestEnd = timeToMinutes(context.request.endTime);
        const open = timeToMinutes(courtDayConfig.openTime);
        const close = timeToMinutes(courtDayConfig.closeTime);
        if (requestStart < open || requestEnd > close) {
          blockers.push({
            ruleCode: 'SIMPLE-COURT-HOURS',
            ruleName: 'Court Hours',
            passed: false,
            severity: 'error',
            message: 'This court is not available during the selected time'
          });
        }
      }
    }

    if (config.maxReservationDuration?.enabled) {
      const maxDuration = Number(config.maxReservationDuration.limit) || 0;
      if (maxDuration > 0 && context.request.durationMinutes > maxDuration) {
        const formatted = maxDuration >= 60
          ? `${maxDuration / 60} ${maxDuration / 60 === 1 ? 'hour' : 'hours'}`
          : `${maxDuration} minutes`;
        blockers.push({
          ruleCode: 'SIMPLE-MAX-DURATION',
          ruleName: 'Max Reservation Duration',
          passed: false,
          severity: 'error',
          message: `Bookings cannot exceed ${formatted}`
        });
      }
    }

    const countable = (b: any) => b.status === 'confirmed';
    const requestDay = context.request.bookingDate;
    const weekStartDate = new Date(context.currentDateTime);
    const dow = weekStartDate.getDay(); // 0=Sun..6=Sat
    const diffToMonday = dow === 0 ? -6 : 1 - dow;
    weekStartDate.setDate(weekStartDate.getDate() + diffToMonday);
    weekStartDate.setHours(0, 0, 0, 0);
    const weekEndDate = new Date(weekStartDate);
    weekEndDate.setDate(weekStartDate.getDate() + 6);
    const weekStart = formatDate(weekStartDate);
    const weekEnd = formatDate(weekEndDate);
    const userDayCount = context.existingBookings.user.filter((b) => countable(b) && b.bookingDate === requestDay).length;
    const userWeekCount = context.existingBookings.user.filter((b) => countable(b) && b.bookingDate >= weekStart && b.bookingDate <= weekEnd).length;
    const householdDayCount = context.existingBookings.household.filter((b) => countable(b) && b.bookingDate === requestDay).length;
    const householdWeekCount = context.existingBookings.household.filter((b) => countable(b) && b.bookingDate >= weekStart && b.bookingDate <= weekEnd).length;

    if (config.userLimits?.perDayIndividual?.enabled && userDayCount >= Number(config.userLimits.perDayIndividual.limit || 0)) {
      const limit = Number(config.userLimits.perDayIndividual.limit || 0);
      blockers.push({
        ruleCode: 'SIMPLE-DAY-USER',
        ruleName: 'Courts Per Day (Individual)',
        passed: false,
        severity: 'error',
        message: `You have reached your daily booking limit of ${limit}`
      });
    }
    if (config.userLimits?.perWeekIndividual?.enabled && userWeekCount >= Number(config.userLimits.perWeekIndividual.limit || 0)) {
      const limit = Number(config.userLimits.perWeekIndividual.limit || 0);
      blockers.push({
        ruleCode: 'SIMPLE-WEEK-USER',
        ruleName: 'Courts Per Week (Individual)',
        passed: false,
        severity: 'error',
        message: `You have reached your weekly booking limit of ${limit}`
      });
    }

    const enforceHousehold = config.restrictionType === 'address' && !!context.household;
    if (enforceHousehold && config.userLimits?.perDayHousehold?.enabled && householdDayCount >= Number(config.userLimits.perDayHousehold.limit || 0)) {
      const limit = Number(config.userLimits.perDayHousehold.limit || 0);
      blockers.push({
        ruleCode: 'SIMPLE-DAY-HOUSEHOLD',
        ruleName: 'Courts Per Day (Household)',
        passed: false,
        severity: 'error',
        message: `Your household has reached its daily booking limit of ${limit}`
      });
    }
    if (enforceHousehold && config.userLimits?.perWeekHousehold?.enabled && householdWeekCount >= Number(config.userLimits.perWeekHousehold.limit || 0)) {
      const limit = Number(config.userLimits.perWeekHousehold.limit || 0);
      blockers.push({
        ruleCode: 'SIMPLE-WEEK-HOUSEHOLD',
        ruleName: 'Courts Per Week (Household)',
        passed: false,
        severity: 'error',
        message: `Your household has reached its weekly booking limit of ${limit}`
      });
    }

    if (config.hasPeakHours && Array.isArray(config.peakHoursSlots)) {
      const applicableSlots = config.peakHoursSlots.filter((slot) => {
        if (!slot.days?.includes(dayOfWeek)) return false;
        if (!slot.appliesToAllCourts && !slot.selectedCourtIds?.includes(context.court.id)) return false;
        return timeRangesOverlap(context.request.startTime, context.request.endTime, slot.startTime, slot.endTime);
      });

      for (const slot of applicableSlots) {
        const peakBookings = context.existingBookings.user.filter((b) => {
          if (!countable(b)) return false;
          if (b.bookingDate < weekStart || b.bookingDate > weekEnd) return false;
          if (!slot.days.includes(getDayOfWeek(b.bookingDate))) return false;
          if (!slot.appliesToAllCourts && !slot.selectedCourtIds?.includes(b.courtId)) return false;
          return timeRangesOverlap(b.startTime, b.endTime, slot.startTime, slot.endTime);
        });
        const peakDayCount = peakBookings.filter((b) => b.bookingDate === requestDay).length;
        const peakWeekCount = peakBookings.length;

        if (!slot.rules.maxBookingsPerDayUnlimited) {
          const maxDay = Number(slot.rules.maxBookingsPerDay || 0);
          if (maxDay > 0 && peakDayCount >= maxDay) {
            blockers.push({
              ruleCode: 'SIMPLE-PEAK-DAY',
              ruleName: 'Peak Hours Rules',
              passed: false,
              severity: 'error',
              message: 'You have reached your peak hours booking limit'
            });
            continue;
          }
        }

        if (!slot.rules.maxBookingsPerWeekUnlimited) {
          const maxWeek = Number(slot.rules.maxBookingsPerWeek || 0);
          if (maxWeek > 0 && peakWeekCount >= maxWeek) {
            blockers.push({
              ruleCode: 'SIMPLE-PEAK-WEEK',
              ruleName: 'Peak Hours Rules',
              passed: false,
              severity: 'error',
              message: 'You have reached your peak hours booking limit'
            });
            continue;
          }
        }

        if (!slot.rules.maxDurationUnlimited) {
          const maxPeakMinutes = Math.round((Number(slot.rules.maxDurationHours || 0) || 0) * 60);
          if (maxPeakMinutes > 0 && context.request.durationMinutes > maxPeakMinutes) {
            blockers.push({
              ruleCode: 'SIMPLE-PEAK-DURATION',
              ruleName: 'Peak Hours Rules',
              passed: false,
              severity: 'error',
              message: 'You have reached your peak hours booking limit'
            });
          }
        }
      }
    }

    return {
      allowed: blockers.length === 0,
      results: blockers,
      blockers,
      warnings: [],
      isPrimeTime: false
    };
  }

  /**
   * Evaluate a single rule
   */
  private async evaluateRule(
    rule: FacilityRuleConfig,
    context: RuleContext
  ): Promise<RuleResult | null> {
    const evaluator = this.evaluators.get(rule.ruleCode);

    if (!evaluator) {
      console.warn(`No evaluator found for rule: ${rule.ruleCode}`);
      return null;
    }

    try {
      const result = await evaluator.evaluate(context, rule.ruleConfig);

      // Interpolate failure message if rule failed
      if (!result.passed && rule.failureMessageTemplate) {
        const interpolated = this.interpolateMessage(
          rule.failureMessageTemplate,
          result.details || {}
        );
        // Only use the template if all placeholders were resolved
        if (!interpolated.includes('{')) {
          result.message = interpolated;
        }
      }

      return result;
    } catch (error) {
      console.error(`Error evaluating rule ${rule.ruleCode}:`, error);
      return {
        ruleCode: rule.ruleCode,
        ruleName: rule.ruleName,
        passed: true, // Don't block on evaluation errors
        severity: 'warning',
        message: `Error evaluating rule: ${rule.ruleName}`
      };
    }
  }

  /**
   * Get rules applicable to this booking
   */
  private getApplicableRules(context: RuleContext): FacilityRuleConfig[] {
    const retiredRuleCodes = new Set(['ACC-006', 'ACC-008', 'CRT-012']);
    return context.facility.rules.filter(rule => {
      if (retiredRuleCodes.has(rule.ruleCode)) {
        return false;
      }

      // Check if rule applies to this court
      if (rule.appliesToCourtIds && rule.appliesToCourtIds.length > 0) {
        if (!rule.appliesToCourtIds.includes(context.court.id)) {
          return false;
        }
      }

      // Check if rule applies to this tier
      if (rule.appliesToTierIds && rule.appliesToTierIds.length > 0) {
        if (context.user.tier && !rule.appliesToTierIds.includes(context.user.tier.id)) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * Interpolate message template with actual values
   */
  private interpolateMessage(
    template: string,
    values: Record<string, any>
  ): string {
    return template.replace(/\{(\w+)\}/g, (match, key) => {
      return values[key] !== undefined ? String(values[key]) : match;
    });
  }

  /**
   * Evaluate with admin override - bypasses rules with audit trail
   */
  async evaluateWithOverride(
    request: BookingRequest,
    override: AdminOverride
  ): Promise<EvaluationResult> {
    const result = await this.evaluate(request);

    if (!result.allowed) {
      // Log override
      await this.logAdminOverride(request, override, result.blockers);

      // Mark blockers as overridden
      for (const blocker of result.blockers) {
        blocker.details = {
          ...blocker.details,
          overridden: true,
          overriddenBy: override.adminId,
          overrideReason: override.reason
        };
      }
    }

    return {
      ...result,
      allowed: true // Override allows the booking
    };
  }

  /**
   * Log admin override for audit
   */
  private async logAdminOverride(
    request: BookingRequest,
    override: AdminOverride,
    blockers: RuleResult[]
  ): Promise<void> {
    try {
      await query(
        `INSERT INTO booking_violations (
          user_id, facility_id, violation_type, violation_description, resolved, resolved_by, notes
        ) VALUES ($1, $2, $3, $4, true, $5, $6)`,
        [
          request.userId,
          request.facilityId,
          'admin_override',
          `Admin override for rules: ${blockers.map(b => b.ruleCode).join(', ')}`,
          override.adminId,
          override.reason
        ]
      );
    } catch (error) {
      console.error('Failed to log admin override:', error);
    }
  }

  /**
   * Validate a booking request without creating it
   */
  async validate(request: BookingRequest): Promise<EvaluationResult> {
    return this.evaluate(request);
  }

  /**
   * Evaluate cancellation request
   */
  async evaluateCancellation(
    request: CancellationRequest
  ): Promise<CancellationEvaluationResult> {
    try {
      const { booking, strikes, facility } = await buildCancellationContext(
        request.bookingId,
        request.userId
      );

      // Calculate minutes before start (use facility timezone for accurate comparison)
      const bookingStart = combineDateAndTime(booking.bookingDate, booking.startTime);
      const facilityTimezone = (facility as any).timezone || 'America/New_York';
      const now = getFacilityLocalNow(facilityTimezone);
      const minutesBeforeStart = minutesBetween(now, bookingStart);

      const bookingEnd = combineDateAndTime(booking.bookingDate, booking.endTime);
      if (now > bookingEnd) {
        return {
          allowed: false,
          isLateCancel: false,
          strikeWillBeIssued: false,
          minutesBeforeStart,
          message: 'This reservation has already ended and cannot be cancelled'
        };
      }

      return {
        allowed: true,
        isLateCancel: false,
        strikeWillBeIssued: false,
        minutesBeforeStart,
        message: 'Members can cancel at any time up until the reservation ends.'
      };
    } catch (error: any) {
      // Gracefully handle missing tables
      if (error?.code === '42P01') {
        console.warn('Rules engine tables not found. Skipping cancellation rule evaluation.');
        return {
          allowed: true,
          isLateCancel: false,
          strikeWillBeIssued: false,
          minutesBeforeStart: 0
        };
      }
      throw error;
    }
  }
}

// Export singleton instance
export const rulesEngine = new RulesEngine();

// Export types
export * from './types';
export { buildRuleContext, buildCancellationContext } from './RuleContext';
