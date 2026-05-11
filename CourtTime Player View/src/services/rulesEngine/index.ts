/**
 * CourtTime Booking Rules Engine
 * Main entry point for rule evaluation
 */

import { query } from '../../database/connection';
import {
  buildRuleContext,
  buildCancellationContext,
  getFacilityLocalNow,
  getPeakHoursSlotsForEnforcement,
  resolveDailyIndividualFromBookingRules,
  resolveWeeklyIndividualFromBookingRules,
  resolveDailyHouseholdFromBookingRules,
  resolveWeeklyHouseholdFromBookingRules
} from './RuleContext';
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
import {
  combineDateAndTime,
  coerceDayOfWeekList,
  formatDate,
  getDayOfWeek,
  getTodayYmdInTimeZone,
  minutesBetween,
  timeRangesOverlap
} from './utils/timeUtils';

// Import evaluators
import { accountEvaluators } from './evaluators/AccountRuleEvaluators';
import { courtEvaluators } from './evaluators/CourtRuleEvaluators';
import { householdEvaluators } from './evaluators/HouseholdRuleEvaluators';

/**
 * Main Rules Engine class
 */
export class RulesEngine {
  private evaluators: Map<string, RuleEvaluator>;
  private readonly allowedRuleCodes = new Set([
    'ACC-002',
    'ACC-005',
    'CRT-005',
    'ACC-010',
    'CRT-001',
    'CRT-002',
    'HH-003'
  ]);

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

      // Facility admins always bypass player reservation rules.
      if (context.user.isFacilityAdmin) {
        return {
          allowed: true,
          results: [],
          blockers: [],
          warnings: [],
          isPrimeTime: context.isPrimeTime
        };
      }

      // Use legacy simplified rules only as a fallback when no configured
      // rules-engine entries exist for this facility.
      const hasConfiguredEngineRules = Array.isArray(context.facility.rules) && context.facility.rules.length > 0;
      const simplifiedResult = hasConfiguredEngineRules ? null : this.evaluateSimplifiedRules(context);
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

      // Other engine rules skip the full simplified path. Keep simplified daily limits in force,
      // and keep weekly limits in force when ACC-002 is absent or not tier-applicable.
      const hasApplicableAcc002 = rules.some((r) => r.ruleCode === 'ACC-002');
      results.push(...this.dailyAndWeeklyLimitsFromSimplifiedConfig(context, !hasApplicableAcc002));
      results.push(...this.peakHourLimitsFromAdminBookingRules(context));

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

  /**
   * Weekly individual (from resolveWeeklyIndividualFromBookingRules) + weekly household limits
   * using the same confirmed-only counts as the legacy simplified path.
   */
  private dailyAndWeeklyLimitsFromSimplifiedConfig(
    context: RuleContext,
    includeWeekly: boolean = true
  ): RuleResult[] {
    const out: RuleResult[] = [];
    const countable = (b: { status: string }) => b.status !== 'cancelled';
    const requestDay = context.request.bookingDate;
    const [wy, wm, wd] = context.request.bookingDate.split('-').map(Number);
    const weekStartDate = new Date(wy, wm - 1, wd, 12, 0, 0, 0);
    const dow = weekStartDate.getDay();
    const diffToMonday = dow === 0 ? -6 : 1 - dow;
    weekStartDate.setDate(weekStartDate.getDate() + diffToMonday);
    weekStartDate.setHours(0, 0, 0, 0);
    const weekEndDate = new Date(weekStartDate);
    weekEndDate.setDate(weekStartDate.getDate() + 6);
    const weekStart = formatDate(weekStartDate);
    const weekEnd = formatDate(weekEndDate);

    const userWeekCount = context.existingBookings.user.filter(
      (b) => countable(b) && b.bookingDate >= weekStart && b.bookingDate <= weekEnd
    ).length;
    const userDayCount = context.existingBookings.user.filter(
      (b) => countable(b) && b.bookingDate === requestDay
    ).length;
    const householdWeekCount = context.existingBookings.household.filter(
      (b) => countable(b) && b.bookingDate >= weekStart && b.bookingDate <= weekEnd
    ).length;
    const householdDayCount = context.existingBookings.household.filter(
      (b) => countable(b) && b.bookingDate === requestDay
    ).length;

    const dailyIndividual = resolveDailyIndividualFromBookingRules(context.facility);
    if (dailyIndividual.enabled && dailyIndividual.limit > 0 && userDayCount >= dailyIndividual.limit) {
      const limit = dailyIndividual.limit;
      out.push({
        ruleCode: 'SIMPLE-DAY-USER',
        ruleName: 'Courts Per Day (Individual)',
        passed: false,
        severity: 'error',
        message: `You have reached your daily booking limit of ${limit}`
      });
    }

    if (includeWeekly) {
      const weeklyIndividual = resolveWeeklyIndividualFromBookingRules(context.facility);
      if (weeklyIndividual.enabled && weeklyIndividual.limit > 0 && userWeekCount >= weeklyIndividual.limit) {
        const limit = weeklyIndividual.limit;
        out.push({
          ruleCode: 'SIMPLE-WEEK-USER',
          ruleName: 'Courts Per Week (Individual)',
          passed: false,
          severity: 'error',
          message: `You have reached your weekly booking limit of ${limit}`
        });
      }
    }

    // Household caps apply to all members at an address when toggles are on and the booker
    // belongs to a household — independent of restrictionType (account vs address).
    const dailyHousehold = resolveDailyHouseholdFromBookingRules(context.facility);
    if (
      context.household &&
      dailyHousehold.enabled &&
      dailyHousehold.limit > 0 &&
      householdDayCount >= dailyHousehold.limit
    ) {
      const limit = dailyHousehold.limit;
      out.push({
        ruleCode: 'SIMPLE-DAY-HOUSEHOLD',
        ruleName: 'Courts Per Day (Household)',
        passed: false,
        severity: 'error',
        message: `Your household has reached its daily booking limit of ${limit}`
      });
    }

    // Household weekly cap is separate from ACC-002 (individual weekly); do not skip when ACC-002 is on.
    const weeklyHousehold = resolveWeeklyHouseholdFromBookingRules(context.facility);
    if (
      context.household &&
      weeklyHousehold.enabled &&
      weeklyHousehold.limit > 0 &&
      householdWeekCount >= weeklyHousehold.limit
    ) {
      const limit = weeklyHousehold.limit;
      out.push({
        ruleCode: 'SIMPLE-WEEK-HOUSEHOLD',
        ruleName: 'Courts Per Week (Household)',
        passed: false,
        severity: 'error',
        message: `Your household has reached its weekly booking limit of ${limit}`
      });
    }

    return out;
  }

  /**
   * Peak-hour caps from `facilities.booking_rules` (hasPeakHours + peakHoursSlots).
   * Must run even when other rule-engine rows exist — those facilities previously skipped
   * `evaluateSimplifiedRules` entirely, so peak limits were never enforced.
   */
  private peakHourLimitsFromAdminBookingRules(context: RuleContext): RuleResult[] {
    // Prefer merged slots (booking_rules + CRT-001 + legacy facility_rules). Enforcement used to
    // read only `getPeakHoursSlotsForEnforcement`, so peak windows stored only in rule configs
    // never applied daily/weekly/duration caps.
    const fromMerged = context.peakHoursSlots;
    const fromBookingRules = getPeakHoursSlotsForEnforcement(context.facility);
    const peakSlots =
      fromMerged.length > 0 ? fromMerged : (fromBookingRules ?? []);
    if (peakSlots.length === 0) {
      return [];
    }

    const raw = context.facility.bookingRulesRaw;
    const norm = context.facility.simplifiedBookingRules;
    const peakAppliesToAdmins =
      norm?.peakHoursApplyToAdmins !== false &&
      raw?.peakHoursApplyToAdmins !== false &&
      raw?.peak_hours_apply_to_admins !== false;
    if (context.user.isFacilityAdmin && !peakAppliesToAdmins) {
      return [];
    }

    // Slot caps must always be evaluated from CRT-001 / booking_rules windows. Previously we skipped
    // weekly slot limits when ACC-010/HH-003 rows existed on the facility, but those rows are not
    // filtered by tier/court here — ACC-010 can be absent from the applicable rule list yet still
    // suppress SIMPLE-PEAK-WEEK. ACC-010 also no-ops when isPrimeTime is false, leaving no weekly cap.
    const skipPeakDuration = context.facility.rules?.some((r) => r.ruleCode === 'CRT-002');

    const out: RuleResult[] = [];
    const countable = (b: { status: string }) => b.status !== 'cancelled';
    const requestDay = context.request.bookingDate;
    const dayOfWeek = getDayOfWeek(context.request.bookingDate);
    const [wy, wm, wd] = context.request.bookingDate.split('-').map(Number);
    const weekStartDate = new Date(wy, wm - 1, wd, 12, 0, 0, 0);
    const dow0 = weekStartDate.getDay();
    const diffToMonday = dow0 === 0 ? -6 : 1 - dow0;
    weekStartDate.setDate(weekStartDate.getDate() + diffToMonday);
    weekStartDate.setHours(0, 0, 0, 0);
    const weekEndDate = new Date(weekStartDate);
    weekEndDate.setDate(weekStartDate.getDate() + 6);
    const weekStart = formatDate(weekStartDate);
    const weekEnd = formatDate(weekEndDate);

    const hhBookings = context.household
      ? context.existingBookings.household
      : context.existingBookings.user;

    const truthyUnlimited = (flag: unknown): boolean =>
      flag === true ||
      flag === 1 ||
      (typeof flag === 'string' && flag.toLowerCase() === 'true');
    const rawUnlimited = (flag: unknown, limit: unknown): boolean =>
      truthyUnlimited(flag) || limit === -1 || limit === '-1';

    const applicableSlots = peakSlots.filter((slot: any) => {
      const days = coerceDayOfWeekList(slot.days);
      if (!days.includes(dayOfWeek)) return false;
      const appliesAll = slot.appliesToAllCourts !== false && slot.applies_to_all_courts !== false;
      const courtIds: string[] = Array.isArray(slot.selectedCourtIds)
        ? slot.selectedCourtIds
        : Array.isArray(slot.selected_court_ids)
          ? slot.selected_court_ids
          : [];
      if (!appliesAll && !courtIds.includes(context.court.id)) return false;
      const start = slot.startTime || slot.start_time;
      const end = slot.endTime || slot.end_time;
      return timeRangesOverlap(context.request.startTime, context.request.endTime, start, end);
    });

    for (const slot of applicableSlots) {
      const slotDays = coerceDayOfWeekList(slot.days);
      const slotStart = slot.startTime || slot.start_time;
      const slotEnd = slot.endTime || slot.end_time;
      const appliesAllCourts = slot.appliesToAllCourts !== false && slot.applies_to_all_courts !== false;
      const selCourtIds: string[] = Array.isArray(slot.selectedCourtIds)
        ? slot.selectedCourtIds
        : Array.isArray(slot.selected_court_ids)
          ? slot.selected_court_ids
          : [];
      const r = (slot.rules ?? {}) as Record<string, any>;
      const maxDayRaw = r.maxBookingsPerDay ?? r.max_bookings_per_day;
      const maxWeekRaw = r.maxBookingsPerWeek ?? r.max_bookings_per_week;
      const maxDayHhRaw = r.maxBookingsPerDayHousehold ?? r.max_bookings_per_day_household;
      const maxWeekHhRaw = r.maxBookingsPerWeekHousehold ?? r.max_bookings_per_week_household;
      const maxDurRaw = r.maxDurationHours ?? r.max_duration_hours;
      const maxDayUnlimited =
        rawUnlimited(r.maxBookingsPerDayUnlimited, maxDayRaw) ||
        rawUnlimited(r.max_bookings_per_day_unlimited, maxDayRaw);
      const maxWeekUnlimited =
        rawUnlimited(r.maxBookingsPerWeekUnlimited, maxWeekRaw) ||
        rawUnlimited(r.max_bookings_per_week_unlimited, maxWeekRaw);
      const maxDayHhUnlimited =
        rawUnlimited(r.maxBookingsPerDayHouseholdUnlimited, maxDayHhRaw) ||
        rawUnlimited(r.max_bookings_per_day_household_unlimited, maxDayHhRaw);
      const maxWeekHhUnlimited =
        rawUnlimited(r.maxBookingsPerWeekHouseholdUnlimited, maxWeekHhRaw) ||
        rawUnlimited(r.max_bookings_per_week_household_unlimited, maxWeekHhRaw);
      const maxDurUnlimited =
        rawUnlimited(r.maxDurationUnlimited, maxDurRaw) ||
        rawUnlimited(r.max_duration_unlimited, maxDurRaw);

      const peakBookings = context.existingBookings.user.filter((b) => {
        if (!countable(b)) return false;
        if (b.bookingDate < weekStart || b.bookingDate > weekEnd) return false;
        if (!slotDays.includes(getDayOfWeek(b.bookingDate))) return false;
        if (!appliesAllCourts && !selCourtIds.includes(b.courtId)) return false;
        return timeRangesOverlap(b.startTime, b.endTime, slotStart, slotEnd);
      });
      const peakDayCount = peakBookings.filter((b) => b.bookingDate === requestDay).length;
      const peakWeekCount = peakBookings.length;

      if (!maxDayUnlimited) {
        const maxDay = Number(maxDayRaw ?? 0);
        if (maxDay > 0 && peakDayCount >= maxDay) {
          out.push({
            ruleCode: 'SIMPLE-PEAK-DAY',
            ruleName: 'Peak Hours Rules',
            passed: false,
            severity: 'error',
            message: 'You have reached your peak hours booking limit'
          });
          continue;
        }
      }

      if (!maxWeekUnlimited) {
        const maxWeek = Number(maxWeekRaw ?? 0);
        if (maxWeek > 0 && peakWeekCount >= maxWeek) {
          out.push({
            ruleCode: 'SIMPLE-PEAK-WEEK',
            ruleName: 'Peak Hours Rules',
            passed: false,
            severity: 'error',
            message: 'You have reached your peak hours booking limit'
          });
          continue;
        }
      }

      const peakHhBookings = hhBookings.filter((b) => {
        if (!countable(b)) return false;
        if (b.bookingDate < weekStart || b.bookingDate > weekEnd) return false;
        if (!slotDays.includes(getDayOfWeek(b.bookingDate))) return false;
        if (!appliesAllCourts && !selCourtIds.includes(b.courtId)) return false;
        return timeRangesOverlap(b.startTime, b.endTime, slotStart, slotEnd);
      });
      const peakHhDayCount = peakHhBookings.filter((b) => b.bookingDate === requestDay).length;
      const peakHhWeekCount = peakHhBookings.length;

      if (!maxDayHhUnlimited) {
        const maxDayHh = Number(maxDayHhRaw ?? 0);
        if (maxDayHh > 0 && peakHhDayCount >= maxDayHh) {
          out.push({
            ruleCode: 'SIMPLE-PEAK-DAY-HOUSEHOLD',
            ruleName: 'Peak Hours Rules (Household)',
            passed: false,
            severity: 'error',
            message: 'Your household has reached its peak hours booking limit for this day'
          });
          continue;
        }
      }

      if (!maxWeekHhUnlimited) {
        const maxWeekHh = Number(maxWeekHhRaw ?? 0);
        if (maxWeekHh > 0 && peakHhWeekCount >= maxWeekHh) {
          out.push({
            ruleCode: 'SIMPLE-PEAK-WEEK-HOUSEHOLD',
            ruleName: 'Peak Hours Rules (Household)',
            passed: false,
            severity: 'error',
            message: 'Your household has reached its peak hours booking limit for this week'
          });
          continue;
        }
      }

      if (!skipPeakDuration && !maxDurUnlimited) {
        const maxPeakMinutes = Math.round((Number(maxDurRaw ?? 0) || 0) * 60);
        if (maxPeakMinutes > 0 && context.request.durationMinutes > maxPeakMinutes) {
          out.push({
            ruleCode: 'SIMPLE-PEAK-DURATION',
            ruleName: 'Peak Hours Rules',
            passed: false,
            severity: 'error',
            message: 'You have reached your peak hours booking limit'
          });
        }
      }
    }

    return out;
  }

  private evaluateSimplifiedRules(context: RuleContext): EvaluationResult | null {
    const config = context.facility.simplifiedBookingRules;
    if (!config) return null;

    const blockers: RuleResult[] = [];
    const tz = context.facility.timezone || 'America/New_York';
    const facilityTodayYmd = getTodayYmdInTimeZone(tz);

    if (config.daysInAdvance?.enabled) {
      const maxDaysAhead = Number(config.daysInAdvance.limit);
      if (Number.isFinite(maxDaysAhead) && maxDaysAhead > 0) {
        const daysAhead = diffCalendarDaysYmd(facilityTodayYmd, context.request.bookingDate);
        if (daysAhead > maxDaysAhead) {
          const lastBookableYmd = addCalendarDaysYmd(facilityTodayYmd, maxDaysAhead);
          blockers.push({
            ruleCode: 'SIMPLE-ADVANCE',
            ruleName: 'Days in Advance',
            passed: false,
            severity: 'error',
            message: `You can book up to ${maxDaysAhead} days in advance. Latest bookable date: ${lastBookableYmd}.`
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

    blockers.push(...this.dailyAndWeeklyLimitsFromSimplifiedConfig(context, true));
    blockers.push(...this.peakHourLimitsFromAdminBookingRules(context));

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
      if (!this.allowedRuleCodes.has(rule.ruleCode)) {
        return false;
      }
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
