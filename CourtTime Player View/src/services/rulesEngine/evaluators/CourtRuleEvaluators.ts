/**
 * Court Rule Evaluators (CRT-001 to CRT-012)
 */

import { query } from '../../../database/connection';
import {
  RuleEvaluator,
  RuleContext,
  RuleResult,
  CRT002Config,
  CRT003Config,
  CRT005Config,
  CRT007Config,
  CRT008Config,
  CRT009Config,
  CRT010Config,
  CRT011Config
} from '../types';
import {
  getDayOfWeek,
  timeToMinutes,
  isAlignedToSlot,
  timeRangesOverlap,
  getTimeWindow,
  formatDate,
  combineDateAndTime,
  addDays,
  matchesRecurrenceRule
} from '../utils/timeUtils';
import { isTierEligibleForPrimeTime } from '../utils/primeTimeUtils';

/**
 * CRT-001: Prime-Time Schedule
 * This rule just marks prime time - actual restrictions are in other rules
 */
const CRT001: RuleEvaluator = {
  ruleCode: 'CRT-001',
  ruleName: 'Prime-Time Schedule',
  category: 'court',

  async evaluate(context: RuleContext, config: any): Promise<RuleResult> {
    // This rule is informational - actual enforcement is in CRT-002, CRT-003, ACC-010
    if (context.isPrimeTime) {
      return {
        ruleCode: 'CRT-001',
        ruleName: 'Prime-Time Schedule',
        passed: true,
        severity: 'warning',
        message: `This time is designated as prime time for ${context.court.name}.`,
        details: { isPrimeTime: true, courtName: context.court.name }
      };
    }

    return { ruleCode: 'CRT-001', ruleName: 'Prime-Time Schedule', passed: true, severity: 'warning' };
  }
};

/**
 * CRT-002: Prime-Time Max Duration
 */
const CRT002: RuleEvaluator = {
  ruleCode: 'CRT-002',
  ruleName: 'Prime-Time Max Duration',
  category: 'court',

  async evaluate(context: RuleContext, config: CRT002Config): Promise<RuleResult> {
    // Only apply during prime time
    if (!context.isPrimeTime) {
      return { ruleCode: 'CRT-002', ruleName: 'Prime-Time Max Duration', passed: true, severity: 'error' };
    }

    // Get max duration from court config or rule config
    const dayOfWeek = getDayOfWeek(context.request.bookingDate);
    const dayConfig = context.court.operatingConfig?.find(c => c.dayOfWeek === dayOfWeek);
    const maxMinutes = dayConfig?.primeTimeMaxDuration || config.max_minutes_prime || 60;

    if (context.request.durationMinutes > maxMinutes) {
      return {
        ruleCode: 'CRT-002',
        ruleName: 'Prime-Time Max Duration',
        passed: false,
        severity: 'error',
        message: `Prime-time bookings on ${context.court.name} are limited to ${maxMinutes} minutes.`,
        details: {
          maxMinutes,
          requestedMinutes: context.request.durationMinutes,
          courtName: context.court.name
        }
      };
    }

    return { ruleCode: 'CRT-002', ruleName: 'Prime-Time Max Duration', passed: true, severity: 'error' };
  }
};

/**
 * CRT-003: Prime-Time Eligibility by Tier
 */
const CRT003: RuleEvaluator = {
  ruleCode: 'CRT-003',
  ruleName: 'Prime-Time Eligibility by Tier',
  category: 'court',

  async evaluate(context: RuleContext, config: CRT003Config): Promise<RuleResult> {
    // Only apply during prime time
    if (!context.isPrimeTime) {
      return { ruleCode: 'CRT-003', ruleName: 'Prime-Time Eligibility by Tier', passed: true, severity: 'error' };
    }

    // Check tier's prime time eligibility
    if (context.user.tier && !context.user.tier.primeTimeEligible) {
      return {
        ruleCode: 'CRT-003',
        ruleName: 'Prime-Time Eligibility by Tier',
        passed: false,
        severity: 'error',
        message: `Your membership tier (${context.user.tier.tierName}) is not eligible to book prime time on ${context.court.name}.`,
        details: {
          tierName: context.user.tier.tierName,
          courtName: context.court.name
        }
      };
    }

    // Check allowed tiers list from config
    const allowedTiers = config.allowed_tiers || [];
    const allowAdminOverride = config.allow_admin_override !== false;

    if (allowedTiers.length > 0) {
      const tierName = context.user.tier?.tierName || 'default';
      const isEligible = isTierEligibleForPrimeTime(
        tierName,
        allowedTiers,
        allowAdminOverride,
        context.user.isFacilityAdmin || false
      );

      if (!isEligible) {
        return {
          ruleCode: 'CRT-003',
          ruleName: 'Prime-Time Eligibility by Tier',
          passed: false,
          severity: 'error',
          message: `Your membership tier is not eligible to book prime time on ${context.court.name}.`,
          details: {
            tierName,
            allowedTiers,
            courtName: context.court.name
          }
        };
      }
    }

    return { ruleCode: 'CRT-003', ruleName: 'Prime-Time Eligibility by Tier', passed: true, severity: 'error' };
  }
};

/**
 * CRT-004: Court Operating Hours
 */
const CRT004: RuleEvaluator = {
  ruleCode: 'CRT-004',
  ruleName: 'Court Operating Hours',
  category: 'court',

  async evaluate(context: RuleContext, config: any): Promise<RuleResult> {
    const dayOfWeek = getDayOfWeek(context.request.bookingDate);
    const dayConfig = context.court.operatingConfig?.find(c => c.dayOfWeek === dayOfWeek);

    // Check if court is open on this day
    if (dayConfig && !dayConfig.isOpen) {
      return {
        ruleCode: 'CRT-004',
        ruleName: 'Court Operating Hours',
        passed: false,
        severity: 'error',
        message: `${context.court.name} is closed on this day.`,
        details: { courtName: context.court.name, dayOfWeek }
      };
    }

    // Check operating hours
    if (dayConfig && dayConfig.openTime && dayConfig.closeTime) {
      const requestStart = timeToMinutes(context.request.startTime);
      const requestEnd = timeToMinutes(context.request.endTime);
      const openTime = timeToMinutes(dayConfig.openTime);
      const closeTime = timeToMinutes(dayConfig.closeTime);

      if (requestStart < openTime || requestEnd > closeTime) {
        return {
          ruleCode: 'CRT-004',
          ruleName: 'Court Operating Hours',
          passed: false,
          severity: 'error',
          message: `${context.court.name} is only available ${dayConfig.openTime} - ${dayConfig.closeTime}.`,
          details: {
            courtName: context.court.name,
            openTime: dayConfig.openTime,
            closeTime: dayConfig.closeTime,
            requestedStart: context.request.startTime,
            requestedEnd: context.request.endTime
          }
        };
      }
    }

    // Fall back to facility operating hours if no court-specific config
    if (!dayConfig && context.facility.operatingHours) {
      const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const dayName = days[dayOfWeek];
      const facilityHours = context.facility.operatingHours[dayName];

      if (facilityHours?.closed) {
        return {
          ruleCode: 'CRT-004',
          ruleName: 'Court Operating Hours',
          passed: false,
          severity: 'error',
          message: `${context.facility.name} is closed on this day.`,
          details: { facilityName: context.facility.name, dayOfWeek }
        };
      }

      if (facilityHours?.open && facilityHours?.close) {
        const requestStart = timeToMinutes(context.request.startTime);
        const requestEnd = timeToMinutes(context.request.endTime);
        const openTime = timeToMinutes(facilityHours.open + ':00');
        const closeTime = timeToMinutes(facilityHours.close + ':00');

        if (requestStart < openTime || requestEnd > closeTime) {
          return {
            ruleCode: 'CRT-004',
            ruleName: 'Court Operating Hours',
            passed: false,
            severity: 'error',
            message: `${context.court.name} is only available ${facilityHours.open} - ${facilityHours.close}.`,
            details: {
              courtName: context.court.name,
              openTime: facilityHours.open,
              closeTime: facilityHours.close
            }
          };
        }
      }
    }

    return { ruleCode: 'CRT-004', ruleName: 'Court Operating Hours', passed: true, severity: 'error' };
  }
};

/**
 * CRT-005: Reservation Slot Grid
 */
const CRT005: RuleEvaluator = {
  ruleCode: 'CRT-005',
  ruleName: 'Reservation Slot Grid',
  category: 'court',

  async evaluate(context: RuleContext, config: CRT005Config): Promise<RuleResult> {
    const dayOfWeek = getDayOfWeek(context.request.bookingDate);
    const dayConfig = context.court.operatingConfig?.find(c => c.dayOfWeek === dayOfWeek);

    const slotMinutes = dayConfig?.slotDuration || config.slot_minutes || 30;
    const minDuration = dayConfig?.minDuration || config.min_duration_minutes || 30;
    const maxDuration = dayConfig?.maxDuration || config.max_duration_minutes || 120;

    // Check start time alignment
    if (!isAlignedToSlot(context.request.startTime, slotMinutes)) {
      return {
        ruleCode: 'CRT-005',
        ruleName: 'Reservation Slot Grid',
        passed: false,
        severity: 'error',
        message: `Reservations must start on ${slotMinutes}-minute increments.`,
        details: { slotMinutes, requestedStart: context.request.startTime }
      };
    }

    // Check duration bounds
    if (context.request.durationMinutes < minDuration) {
      return {
        ruleCode: 'CRT-005',
        ruleName: 'Reservation Slot Grid',
        passed: false,
        severity: 'error',
        message: `Minimum reservation duration is ${minDuration} minutes.`,
        details: { minDuration, requestedDuration: context.request.durationMinutes }
      };
    }

    if (context.request.durationMinutes > maxDuration) {
      return {
        ruleCode: 'CRT-005',
        ruleName: 'Reservation Slot Grid',
        passed: false,
        severity: 'error',
        message: `Maximum reservation duration is ${maxDuration} minutes.`,
        details: { maxDuration, requestedDuration: context.request.durationMinutes }
      };
    }

    return { ruleCode: 'CRT-005', ruleName: 'Reservation Slot Grid', passed: true, severity: 'error' };
  }
};

/**
 * CRT-006: Blackout Blocks
 */
const CRT006: RuleEvaluator = {
  ruleCode: 'CRT-006',
  ruleName: 'Blackout Blocks',
  category: 'court',

  async evaluate(context: RuleContext, config: any): Promise<RuleResult> {
    const bookingDate = new Date(context.request.bookingDate);
    const bookingStart = combineDateAndTime(context.request.bookingDate, context.request.startTime);
    const bookingEnd = combineDateAndTime(context.request.bookingDate, context.request.endTime);

    for (const blackout of context.blackouts) {
      // Check if blackout applies to this court
      if (blackout.courtId && blackout.courtId !== context.court.id) {
        continue;
      }

      // Check for direct date overlap
      if (blackout.startDatetime <= bookingEnd && blackout.endDatetime >= bookingStart) {
        const reason = blackout.visibility === 'visible' ? blackout.title : 'scheduled maintenance';
        return {
          ruleCode: 'CRT-006',
          ruleName: 'Blackout Blocks',
          passed: false,
          severity: 'error',
          message: `${context.court.name} is unavailable during this time (${reason}).`,
          details: {
            courtName: context.court.name,
            reason,
            blackoutType: blackout.blackoutType,
            blackoutStart: blackout.startDatetime,
            blackoutEnd: blackout.endDatetime
          }
        };
      }

      // Check recurring blackouts
      if (blackout.recurrenceRule) {
        const originalDate = new Date(blackout.startDatetime);
        if (matchesRecurrenceRule(blackout.recurrenceRule, originalDate, bookingDate)) {
          // Check time overlap within the day
          const blackoutStartTime = blackout.startDatetime.toTimeString().slice(0, 8);
          const blackoutEndTime = blackout.endDatetime.toTimeString().slice(0, 8);

          if (timeRangesOverlap(
            context.request.startTime,
            context.request.endTime,
            blackoutStartTime,
            blackoutEndTime
          )) {
            const reason = blackout.visibility === 'visible' ? blackout.title : 'recurring maintenance';
            return {
              ruleCode: 'CRT-006',
              ruleName: 'Blackout Blocks',
              passed: false,
              severity: 'error',
              message: `${context.court.name} is unavailable during this time (${reason}).`,
              details: { courtName: context.court.name, reason, recurring: true }
            };
          }
        }
      }
    }

    return { ruleCode: 'CRT-006', ruleName: 'Blackout Blocks', passed: true, severity: 'error' };
  }
};

/**
 * CRT-007: Buffer Time Between Reservations
 */
const CRT007: RuleEvaluator = {
  ruleCode: 'CRT-007',
  ruleName: 'Buffer Time Between Reservations',
  category: 'court',

  async evaluate(context: RuleContext, config: CRT007Config): Promise<RuleResult> {
    const dayOfWeek = getDayOfWeek(context.request.bookingDate);
    const dayConfig = context.court.operatingConfig?.find(c => c.dayOfWeek === dayOfWeek);

    const bufferBefore = dayConfig?.bufferBefore || config.buffer_before_minutes || 0;
    const bufferAfter = dayConfig?.bufferAfter || config.buffer_after_minutes || 5;

    if (bufferBefore === 0 && bufferAfter === 0) {
      return { ruleCode: 'CRT-007', ruleName: 'Buffer Time Between Reservations', passed: true, severity: 'error' };
    }

    const requestStartMinutes = timeToMinutes(context.request.startTime);
    const requestEndMinutes = timeToMinutes(context.request.endTime);

    // Check court bookings for buffer violations
    for (const existing of context.existingBookings.court) {
      const existingStartMinutes = timeToMinutes(existing.startTime);
      const existingEndMinutes = timeToMinutes(existing.endTime);

      // Check if new booking starts too soon after existing booking
      if (bufferAfter > 0) {
        const requiredGapAfter = existingEndMinutes + bufferAfter;
        if (requestStartMinutes > existingEndMinutes && requestStartMinutes < requiredGapAfter) {
          return {
            ruleCode: 'CRT-007',
            ruleName: 'Buffer Time Between Reservations',
            passed: false,
            severity: 'error',
            message: `A ${bufferAfter}-minute buffer is required after the previous booking.`,
            details: { bufferAfter, existingEnd: existing.endTime }
          };
        }
      }

      // Check if new booking ends too close to existing booking
      if (bufferBefore > 0) {
        const requiredGapBefore = existingStartMinutes - bufferBefore;
        if (requestEndMinutes < existingStartMinutes && requestEndMinutes > requiredGapBefore) {
          return {
            ruleCode: 'CRT-007',
            ruleName: 'Buffer Time Between Reservations',
            passed: false,
            severity: 'error',
            message: `A ${bufferBefore}-minute buffer is required before the next booking.`,
            details: { bufferBefore, existingStart: existing.startTime }
          };
        }
      }
    }

    return { ruleCode: 'CRT-007', ruleName: 'Buffer Time Between Reservations', passed: true, severity: 'error' };
  }
};

/**
 * CRT-008: Allowed Activities / Booking Types
 */
const CRT008: RuleEvaluator = {
  ruleCode: 'CRT-008',
  ruleName: 'Allowed Activities',
  category: 'court',

  async evaluate(context: RuleContext, config: CRT008Config): Promise<RuleResult> {
    const allowedTypes = config.allowed_activity_types || [];
    const activityRequired = config.activity_required || false;

    // If no allowed types specified, all are allowed
    if (allowedTypes.length === 0) {
      return { ruleCode: 'CRT-008', ruleName: 'Allowed Activities', passed: true, severity: 'error' };
    }

    const requestedActivity = context.request.activityType || context.request.bookingType;

    // Check if activity is required but not provided
    if (activityRequired && !requestedActivity) {
      return {
        ruleCode: 'CRT-008',
        ruleName: 'Allowed Activities',
        passed: false,
        severity: 'error',
        message: `Please select an activity type for ${context.court.name}.`,
        details: { allowedTypes, courtName: context.court.name }
      };
    }

    // Check if provided activity is allowed
    if (requestedActivity && !allowedTypes.includes(requestedActivity.toLowerCase())) {
      return {
        ruleCode: 'CRT-008',
        ruleName: 'Allowed Activities',
        passed: false,
        severity: 'error',
        message: `"${requestedActivity}" is not allowed on ${context.court.name}. Allowed: ${allowedTypes.join(', ')}.`,
        details: {
          requestedActivity,
          allowedTypes,
          courtName: context.court.name
        }
      };
    }

    return { ruleCode: 'CRT-008', ruleName: 'Allowed Activities', passed: true, severity: 'error' };
  }
};

/**
 * CRT-009: Sub-Amenity Inventory Limit
 */
const CRT009: RuleEvaluator = {
  ruleCode: 'CRT-009',
  ruleName: 'Sub-Amenity Inventory Limit',
  category: 'court',

  async evaluate(context: RuleContext, config: CRT009Config): Promise<RuleResult> {
    const subAmenityType = config.sub_amenity_type;
    const maxConcurrent = config.max_concurrent || 1;
    const scope = config.scope || 'club_wide';

    // Only applies if booking uses this sub-amenity
    const requestedActivity = context.request.activityType || context.request.bookingType;
    if (!requestedActivity || !subAmenityType || requestedActivity.toLowerCase() !== subAmenityType.toLowerCase()) {
      return { ruleCode: 'CRT-009', ruleName: 'Sub-Amenity Inventory Limit', passed: true, severity: 'error' };
    }

    // Count concurrent bookings using this sub-amenity
    const result = await query(
      `SELECT COUNT(*) as count
       FROM bookings
       WHERE facility_id = $1
         AND booking_date = $2
         AND status != 'cancelled'
         AND (activity_type = $3 OR booking_type = $3)
         AND (
           (start_time <= $4 AND end_time > $4)
           OR (start_time < $5 AND end_time >= $5)
           OR (start_time >= $4 AND end_time <= $5)
         )`,
      [
        context.facility.id,
        context.request.bookingDate,
        subAmenityType,
        context.request.startTime,
        context.request.endTime
      ]
    );

    const currentCount = parseInt(result.rows[0]?.count || '0', 10);

    if (currentCount >= maxConcurrent) {
      return {
        ruleCode: 'CRT-009',
        ruleName: 'Sub-Amenity Inventory Limit',
        passed: false,
        severity: 'error',
        message: `All ${subAmenityType} units are currently reserved for that time. Please choose another time or activity.`,
        details: { subAmenityType, maxConcurrent, currentCount }
      };
    }

    return { ruleCode: 'CRT-009', ruleName: 'Sub-Amenity Inventory Limit', passed: true, severity: 'error' };
  }
};

/**
 * CRT-010: Court-Specific Weekly Cap
 */
const CRT010: RuleEvaluator = {
  ruleCode: 'CRT-010',
  ruleName: 'Court-Specific Weekly Cap',
  category: 'court',

  async evaluate(context: RuleContext, config: CRT010Config): Promise<RuleResult> {
    const maxPerWeek = config.max_per_week_per_account || 999;
    const windowType = config.window_type || 'calendar_week';

    const window = getTimeWindow(windowType);
    const windowStart = formatDate(window.startDate);
    const windowEnd = formatDate(window.endDate);

    // Count user's bookings on this specific court in the window
    const courtBookingsThisWeek = context.existingBookings.user.filter(b =>
      b.courtId === context.court.id &&
      b.bookingDate >= windowStart &&
      b.bookingDate <= windowEnd &&
      b.status !== 'cancelled'
    ).length;

    if (courtBookingsThisWeek >= maxPerWeek) {
      return {
        ruleCode: 'CRT-010',
        ruleName: 'Court-Specific Weekly Cap',
        passed: false,
        severity: 'error',
        message: `You've reached the weekly limit for ${context.court.name} (${courtBookingsThisWeek}/${maxPerWeek}).`,
        details: {
          courtName: context.court.name,
          current: courtBookingsThisWeek,
          max: maxPerWeek
        }
      };
    }

    return { ruleCode: 'CRT-010', ruleName: 'Court-Specific Weekly Cap', passed: true, severity: 'error' };
  }
};

/**
 * CRT-011: Court Release Time
 */
const CRT011: RuleEvaluator = {
  ruleCode: 'CRT-011',
  ruleName: 'Court Release Time',
  category: 'court',

  async evaluate(context: RuleContext, config: CRT011Config): Promise<RuleResult> {
    const releaseTimeLocal = config.release_time_local || '07:00';
    const daysAhead = config.days_ahead || 3;

    const dayOfWeek = getDayOfWeek(context.request.bookingDate);
    const dayConfig = context.court.operatingConfig?.find(c => c.dayOfWeek === dayOfWeek);
    const effectiveReleaseTime = dayConfig?.releaseTime || releaseTimeLocal;

    // Calculate when bookings for this date should be released
    const today = new Date();
    const bookingDate = new Date(context.request.bookingDate);
    const daysDiff = Math.ceil((bookingDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (daysDiff > daysAhead) {
      return { ruleCode: 'CRT-011', ruleName: 'Court Release Time', passed: true, severity: 'error' };
    }

    // Check if current time is past release time
    const currentTime = context.currentDateTime.toTimeString().slice(0, 8);
    const releaseDate = addDays(bookingDate, -daysAhead);

    if (today < releaseDate) {
      return {
        ruleCode: 'CRT-011',
        ruleName: 'Court Release Time',
        passed: false,
        severity: 'error',
        message: `Bookings for ${context.request.bookingDate} on ${context.court.name} open on ${formatDate(releaseDate)} at ${effectiveReleaseTime}.`,
        details: {
          targetDate: context.request.bookingDate,
          releaseDate: formatDate(releaseDate),
          releaseTime: effectiveReleaseTime,
          courtName: context.court.name
        }
      };
    }

    // If it's release day, check release time
    if (formatDate(today) === formatDate(releaseDate)) {
      if (currentTime < effectiveReleaseTime) {
        return {
          ruleCode: 'CRT-011',
          ruleName: 'Court Release Time',
          passed: false,
          severity: 'error',
          message: `Bookings for ${context.request.bookingDate} on ${context.court.name} open at ${effectiveReleaseTime} today.`,
          details: {
            targetDate: context.request.bookingDate,
            releaseTime: effectiveReleaseTime,
            courtName: context.court.name
          }
        };
      }
    }

    return { ruleCode: 'CRT-011', ruleName: 'Court Release Time', passed: true, severity: 'error' };
  }
};

/**
 * CRT-012: Court-Specific Cancellation Deadline
 * Note: This is evaluated during cancellation, not booking creation
 */
const CRT012: RuleEvaluator = {
  ruleCode: 'CRT-012',
  ruleName: 'Court-Specific Cancellation Deadline',
  category: 'court',

  async evaluate(context: RuleContext, config: any): Promise<RuleResult> {
    // This rule is informational during booking - actual enforcement is during cancellation
    return { ruleCode: 'CRT-012', ruleName: 'Court-Specific Cancellation Deadline', passed: true, severity: 'warning' };
  }
};

// Export all court evaluators
export const courtEvaluators: RuleEvaluator[] = [
  CRT001,
  CRT002,
  CRT003,
  CRT004,
  CRT005,
  CRT006,
  CRT007,
  CRT008,
  CRT009,
  CRT010,
  CRT011,
  CRT012
];
