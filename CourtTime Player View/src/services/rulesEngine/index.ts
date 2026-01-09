/**
 * CourtTime Booking Rules Engine
 * Main entry point for rule evaluation
 */

import { query } from '../../database/connection';
import { buildRuleContext, buildCancellationContext } from './RuleContext';
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
import { combineDateAndTime, minutesBetween } from './utils/timeUtils';

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
   */
  async evaluate(request: BookingRequest): Promise<EvaluationResult> {
    // Build context (fetch user, court, facility, existing bookings, etc.)
    const context = await buildRuleContext(request);

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
        result.message = this.interpolateMessage(
          rule.failureMessageTemplate,
          result.details || {}
        );
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
    return context.facility.rules.filter(rule => {
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
    const { booking, strikes, facility } = await buildCancellationContext(
      request.bookingId,
      request.userId
    );

    // Find cancellation rules
    const lateCancelRule = facility.rules.find(r => r.ruleCode === 'ACC-008');
    const courtCancelRule = facility.rules.find(r => r.ruleCode === 'CRT-012');

    // Calculate minutes before start
    const bookingStart = combineDateAndTime(booking.bookingDate, booking.startTime);
    const now = new Date();
    const minutesBeforeStart = minutesBetween(now, bookingStart);

    // Determine cutoff (court-specific or account-level)
    let cutoffMinutes = 240; // Default 4 hours
    let penaltyType = 'strike';

    if (courtCancelRule && courtCancelRule.ruleConfig) {
      cutoffMinutes = courtCancelRule.ruleConfig.cancel_cutoff_minutes || cutoffMinutes;
      penaltyType = courtCancelRule.ruleConfig.penalty_type || penaltyType;
    } else if (lateCancelRule && lateCancelRule.ruleConfig) {
      cutoffMinutes = lateCancelRule.ruleConfig.late_cancel_cutoff_minutes || cutoffMinutes;
      penaltyType = lateCancelRule.ruleConfig.penalty_type || penaltyType;
    }

    const isLateCancel = minutesBeforeStart < cutoffMinutes;
    const strikeWillBeIssued = isLateCancel && penaltyType === 'strike';

    let message: string | undefined;
    if (isLateCancel) {
      message = strikeWillBeIssued
        ? `This is a late cancellation (within ${cutoffMinutes} minutes of start). A strike will be issued.`
        : `This is a late cancellation (within ${cutoffMinutes} minutes of start).`;
    }

    return {
      allowed: true, // Cancellation is always allowed, but may have consequences
      isLateCancel,
      strikeWillBeIssued,
      minutesBeforeStart,
      message
    };
  }
}

// Export singleton instance
export const rulesEngine = new RulesEngine();

// Export types
export * from './types';
export { buildRuleContext, buildCancellationContext } from './RuleContext';
