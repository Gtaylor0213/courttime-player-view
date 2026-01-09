/**
 * CourtTime Booking Rules Engine - Type Definitions
 * Based on CourtTime Rules Library v1.0
 */

// =====================================================
// BOOKING REQUEST
// =====================================================

export interface BookingRequest {
  userId: string;
  courtId: string;
  facilityId: string;
  bookingDate: string;       // YYYY-MM-DD
  startTime: string;         // HH:MM:SS (24-hour format)
  endTime: string;           // HH:MM:SS (24-hour format)
  durationMinutes: number;
  bookingType?: string;      // match, practice, lesson, etc.
  activityType?: string;     // For CRT-008
  notes?: string;
}

export interface CancellationRequest {
  bookingId: string;
  userId: string;
  facilityId: string;
  reason?: string;
}

// =====================================================
// USER & TIER TYPES
// =====================================================

export interface UserWithTier {
  id: string;
  email: string;
  fullName: string;
  streetAddress?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  tier?: MembershipTier;
  isFacilityAdmin?: boolean;
}

export interface MembershipTier {
  id: string;
  facilityId: string;
  tierName: string;
  tierLevel: number;
  advanceBookingDays: number;
  primeTimeEligible: boolean;
  primeTimeMaxPerWeek: number;
  maxActiveReservations: number;
  maxReservationsPerWeek: number;
  maxMinutesPerWeek: number;
  description?: string;
  isDefault: boolean;
}

// =====================================================
// HOUSEHOLD TYPES
// =====================================================

export interface HouseholdGroup {
  id: string;
  facilityId: string;
  hoaAddressId?: string;
  streetAddress: string;
  city?: string;
  state?: string;
  zipCode?: string;
  maxMembers: number;
  householdName?: string;
  maxActiveReservations: number;
  primeTimeMaxPerWeek: number;
  members: HouseholdMember[];
}

export interface HouseholdMember {
  id: string;
  householdId: string;
  userId: string;
  isPrimary: boolean;
  verificationStatus: 'pending' | 'verified' | 'rejected';
  addedAt: Date;
}

// =====================================================
// COURT TYPES
// =====================================================

export interface CourtWithConfig {
  id: string;
  facilityId: string;
  name: string;
  courtNumber?: number;
  surfaceType?: string;
  courtType?: string;
  isIndoor: boolean;
  hasLights: boolean;
  status: 'available' | 'maintenance' | 'closed';
  operatingConfig?: CourtOperatingConfig[];
  allowedActivities?: CourtAllowedActivity[];
}

export interface CourtOperatingConfig {
  id: string;
  courtId: string;
  dayOfWeek: number;         // 0=Sunday, 6=Saturday
  isOpen: boolean;
  openTime?: string;         // HH:MM:SS
  closeTime?: string;        // HH:MM:SS
  primeTimeStart?: string;
  primeTimeEnd?: string;
  primeTimeMaxDuration: number;
  slotDuration: number;
  minDuration: number;
  maxDuration: number;
  bufferBefore: number;
  bufferAfter: number;
  releaseTime?: string;
}

export interface CourtAllowedActivity {
  id: string;
  courtId: string;
  activityType: string;
  isAllowed: boolean;
  requiresEquipment: boolean;
  equipmentName?: string;
  maxConcurrent?: number;
}

export interface CourtBlackout {
  id: string;
  courtId?: string;          // null = all courts
  facilityId: string;
  blackoutType: 'maintenance' | 'event' | 'tournament' | 'holiday' | 'weather' | 'custom';
  title: string;
  description?: string;
  startDatetime: Date;
  endDatetime: Date;
  recurrenceRule?: string;
  visibility: 'visible' | 'hidden';
  isActive: boolean;
}

// =====================================================
// FACILITY & RULES TYPES
// =====================================================

export interface FacilityWithRules {
  id: string;
  name: string;
  operatingHours?: Record<string, { open: string; close: string; closed?: boolean }>;
  timezone?: string;
  rules: FacilityRuleConfig[];
  defaultTier?: MembershipTier;
}

export interface FacilityRuleConfig {
  id: string;
  facilityId: string;
  ruleDefinitionId: string;
  ruleCode: string;          // e.g., 'ACC-001'
  ruleCategory: 'account' | 'court' | 'household';
  ruleName: string;
  ruleConfig: Record<string, any>;
  isEnabled: boolean;
  appliesToCourtIds?: string[];
  appliesToTierIds?: string[];
  priority: number;
  failureMessageTemplate?: string;
}

export interface BookingRuleDefinition {
  id: string;
  ruleCode: string;
  ruleCategory: 'account' | 'court' | 'household';
  ruleName: string;
  description?: string;
  configSchema: Record<string, any>;
  defaultConfig: Record<string, any>;
  evaluationOrder: number;
  failureMessageTemplate?: string;
  isSystem: boolean;
}

// =====================================================
// STRIKE TYPES
// =====================================================

export interface AccountStrike {
  id: string;
  userId: string;
  facilityId: string;
  strikeType: 'no_show' | 'late_cancel' | 'violation' | 'manual';
  strikeReason: string;
  relatedBookingId?: string;
  relatedRuleId?: string;
  issuedAt: Date;
  issuedBy?: string;
  expiresAt?: Date;
  appealed: boolean;
  appealNotes?: string;
  appealDate?: Date;
  revoked: boolean;
  revokedAt?: Date;
  revokedBy?: string;
  revokeReason?: string;
}

// =====================================================
// BOOKING TYPES (Extended)
// =====================================================

export interface BookingWithDetails {
  id: string;
  courtId: string;
  userId: string;
  facilityId: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  status: 'confirmed' | 'pending' | 'cancelled' | 'completed';
  bookingType?: string;
  activityType?: string;
  notes?: string;
  isPrimeTime: boolean;
  checkedIn: boolean;
  noShowMarked: boolean;
  createdAt: Date;
  updatedAt: Date;
  // Joined data
  courtName?: string;
  userName?: string;
  userEmail?: string;
}

export interface BookingCancellation {
  id: string;
  bookingId: string;
  userId: string;
  facilityId: string;
  cancelledAt: Date;
  bookingStartTime: Date;
  minutesBeforeStart: number;
  isLateCancel: boolean;
  strikeIssued: boolean;
  strikeId?: string;
  cancelReason?: string;
}

// =====================================================
// RULE EVALUATION TYPES
// =====================================================

export interface RuleContext {
  request: BookingRequest;
  user: UserWithTier;
  court: CourtWithConfig;
  facility: FacilityWithRules;
  household?: HouseholdGroup;
  existingBookings: {
    user: BookingWithDetails[];       // User's existing bookings
    household: BookingWithDetails[];  // Household's existing bookings
    court: BookingWithDetails[];      // Court's bookings on the date
  };
  strikes: AccountStrike[];
  recentCancellations: BookingCancellation[];
  blackouts: CourtBlackout[];
  currentDateTime: Date;
  isPrimeTime: boolean;
}

export interface RuleResult {
  ruleCode: string;
  ruleName: string;
  passed: boolean;
  message?: string;           // User-friendly failure message
  details?: Record<string, any>;  // Additional context for debugging
  severity: 'error' | 'warning';
}

export interface EvaluationResult {
  allowed: boolean;
  results: RuleResult[];
  blockers: RuleResult[];     // Rules that blocked the booking (severity: error, passed: false)
  warnings: RuleResult[];     // Non-blocking warnings (severity: warning, passed: false)
  isPrimeTime: boolean;
}

export interface CancellationEvaluationResult {
  allowed: boolean;
  isLateCancel: boolean;
  strikeWillBeIssued: boolean;
  minutesBeforeStart: number;
  message?: string;
}

// =====================================================
// ADMIN OVERRIDE TYPES
// =====================================================

export interface AdminOverride {
  adminId: string;
  reason: string;
  overrideRuleCodes?: string[];  // Specific rules to override, or all if empty
  timestamp: Date;
}

export interface BookingWithOverride extends BookingRequest {
  override?: AdminOverride;
}

// =====================================================
// RULE EVALUATOR INTERFACE
// =====================================================

export interface RuleEvaluator {
  ruleCode: string;
  ruleName: string;
  category: 'account' | 'court' | 'household';
  evaluate(context: RuleContext, config: Record<string, any>): Promise<RuleResult>;
}

// =====================================================
// WINDOW TYPES (for weekly calculations)
// =====================================================

export type WindowType = 'rolling_7_days' | 'calendar_week';

export interface TimeWindow {
  type: WindowType;
  startDate: Date;
  endDate: Date;
}

// =====================================================
// RULE CONFIG TYPES (for specific rules)
// =====================================================

export interface ACC001Config {
  max_active_reservations: number;
  count_states: string[];
}

export interface ACC002Config {
  max_per_week: number;
  window_type: WindowType;
  include_canceled: boolean;
}

export interface ACC003Config {
  max_minutes_per_week: number;
  window_type: WindowType;
}

export interface ACC004Config {
  allow_overlap: boolean;
  overlap_grace_minutes: number;
}

export interface ACC005Config {
  max_days_ahead: number;
  open_time_local?: string;
}

export interface ACC006Config {
  min_minutes_before_start: number;
}

export interface ACC007Config {
  cooldown_minutes: number;
  only_if_within_minutes_of_start?: number;
}

export interface ACC008Config {
  late_cancel_cutoff_minutes: number;
  penalty_type: 'strike' | 'warning';
  penalty_value: number;
}

export interface ACC009Config {
  strike_threshold: number;
  strike_window_days: number;
  lockout_days: number;
}

export interface ACC010Config {
  max_prime_per_week: number;
  window_type: WindowType;
}

export interface ACC011Config {
  max_actions: number;
  window_seconds: number;
  action_types: string[];
}

export interface CRT002Config {
  max_minutes_prime: number;
}

export interface CRT003Config {
  allowed_tiers: string[];
  allow_admin_override: boolean;
}

export interface CRT005Config {
  slot_minutes: number;
  min_duration_minutes: number;
  max_duration_minutes: number;
}

export interface CRT007Config {
  buffer_before_minutes: number;
  buffer_after_minutes: number;
}

export interface CRT008Config {
  allowed_activity_types: string[];
  activity_required: boolean;
}

export interface CRT009Config {
  sub_amenity_type: string;
  max_concurrent: number;
  scope: 'court_only' | 'club_wide';
}

export interface CRT010Config {
  max_per_week_per_account: number;
  window_type: WindowType;
}

export interface CRT011Config {
  release_time_local: string;
  days_ahead: number;
}

export interface CRT012Config {
  cancel_cutoff_minutes: number;
  penalty_type: 'strike' | 'warning' | 'block_cancel';
  penalty_value: number;
}

export interface HH001Config {
  max_members: number;
  verification_method: 'invite_code' | 'admin_approval' | 'document' | 'mixed';
}

export interface HH002Config {
  max_active_household: number;
}

export interface HH003Config {
  max_prime_per_week_household: number;
  window_type: WindowType;
}
