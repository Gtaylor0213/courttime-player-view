/**
 * Rule defaults, types, and metadata for facility registration
 */

export interface RuleEntry {
  enabled: boolean;
  config: Record<string, any>;
}

export interface AdminRestrictions {
  maxBookingsPerWeek: string;
  maxBookingsUnlimited: boolean;
  maxDurationHours: string;
  maxDurationUnlimited: boolean;
  advanceBookingDays: string;
  advanceBookingUnlimited: boolean;
  cancellationNoticeHours: string;
  cancellationUnlimited: boolean;
}

export interface PeakHoursRestrictions {
  maxBookingsPerWeek: string;
  maxBookingsUnlimited: boolean;
  maxDurationHours: string;
  maxDurationUnlimited: boolean;
}

export interface WeekendPolicy {
  maxBookingsPerWeekend: string;
  maxBookingsUnlimited: boolean;
  maxDurationHours: string;
  maxDurationUnlimited: boolean;
  advanceBookingDays: string;
  advanceBookingUnlimited: boolean;
}

export interface PeakHourSlot {
  id: string;
  startTime: string;
  endTime: string;
}

export interface RulesConfig {
  // General
  generalRules: string;
  restrictionType: 'account' | 'address';

  // Rules engine entries
  rules: Record<string, RuleEntry>;

  // Admin overrides
  restrictionsApplyToAdmins: boolean;
  adminRestrictions: AdminRestrictions;

  // Peak hours
  hasPeakHours: boolean;
  peakHoursApplyToAdmins: boolean;
  peakHoursSlots: Record<string, PeakHourSlot[]>;
  peakHoursRestrictions: PeakHoursRestrictions;

  // Weekend policy
  hasWeekendPolicy: boolean;
  weekendPolicyApplyToAdmins: boolean;
  weekendPolicy: WeekendPolicy;
}

// Rule metadata for display
export interface RuleMeta {
  code: string;
  name: string;
  description: string;
  category: 'account' | 'cancellation' | 'court' | 'household';
  fields: RuleField[];
}

export interface RuleField {
  key: string;
  label: string;
  type: 'number' | 'text' | 'time' | 'select';
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  options?: { value: string; label: string }[];
}

// All configurable rules with metadata
export const RULE_METADATA: RuleMeta[] = [
  // Account Booking Rules
  {
    code: 'ACC-001',
    name: 'Max Active Reservations',
    description: 'Limits how many upcoming reservations a member can have at once.',
    category: 'account',
    fields: [
      { key: 'max_active_reservations', label: 'Max Active', type: 'number', min: 1, max: 50 },
    ],
  },
  {
    code: 'ACC-002',
    name: 'Max Reservations Per Week',
    description: 'Limits how many bookings a member can make in a single week.',
    category: 'account',
    fields: [
      { key: 'max_per_week', label: 'Max Per Week', type: 'number', min: 1, max: 50 },
    ],
  },
  {
    code: 'ACC-003',
    name: 'Max Hours Per Week',
    description: 'Limits total booking hours per member per week.',
    category: 'account',
    fields: [
      { key: 'max_minutes_per_week', label: 'Max Hours', type: 'number', min: 1, max: 100, step: 0.5, suffix: 'hours' },
    ],
  },
  {
    code: 'ACC-004',
    name: 'No Overlapping Reservations',
    description: 'Prevents members from booking overlapping time slots.',
    category: 'account',
    fields: [],
  },
  {
    code: 'ACC-005',
    name: 'Advance Booking Window',
    description: 'How far in advance members can book courts.',
    category: 'account',
    fields: [
      { key: 'max_days_ahead', label: 'Max Days Ahead', type: 'number', min: 1, max: 365, suffix: 'days' },
    ],
  },
  {
    code: 'ACC-006',
    name: 'Minimum Lead Time',
    description: 'Minimum time before a slot starts that a booking can be made.',
    category: 'account',
    fields: [
      { key: 'min_minutes_before_start', label: 'Lead Time', type: 'number', min: 0, max: 1440, suffix: 'minutes' },
    ],
  },
  {
    code: 'ACC-010',
    name: 'Prime-Time Per Week Limit',
    description: 'Limits prime-time bookings per member per week.',
    category: 'account',
    fields: [
      { key: 'max_prime_per_week', label: 'Max Prime-Time/Week', type: 'number', min: 1, max: 20 },
    ],
  },

  // Cancellation & No-Show Rules
  {
    code: 'ACC-007',
    name: 'Cancellation Cooldown',
    description: 'Prevents immediate re-booking after a cancellation.',
    category: 'cancellation',
    fields: [
      { key: 'cooldown_minutes', label: 'Cooldown', type: 'number', min: 1, max: 1440, suffix: 'minutes' },
    ],
  },
  {
    code: 'ACC-008',
    name: 'Late Cancellation Policy',
    description: 'Issues a strike when cancellations happen too close to start time.',
    category: 'cancellation',
    fields: [
      { key: 'late_cancel_cutoff_minutes', label: 'Cutoff', type: 'number', min: 15, max: 1440, suffix: 'minutes before start' },
    ],
  },
  {
    code: 'ACC-009',
    name: 'No-Show / Strike System',
    description: 'Tracks no-shows with escalating penalties. Members are temporarily locked out after reaching the strike threshold.',
    category: 'cancellation',
    fields: [
      { key: 'strike_threshold', label: 'Strikes Before Lockout', type: 'number', min: 1, max: 20 },
      { key: 'strike_window_days', label: 'Rolling Window', type: 'number', min: 1, max: 365, suffix: 'days' },
      { key: 'lockout_days', label: 'Lockout Duration', type: 'number', min: 1, max: 365, suffix: 'days' },
    ],
  },
  {
    code: 'ACC-011',
    name: 'Rate Limit Actions',
    description: 'Prevents rapid-fire booking/cancellation actions to reduce abuse.',
    category: 'cancellation',
    fields: [
      { key: 'max_actions', label: 'Max Actions', type: 'number', min: 1, max: 100 },
      { key: 'window_seconds', label: 'Time Window', type: 'number', min: 10, max: 600, suffix: 'seconds' },
    ],
  },

  // Court Scheduling Rules
  {
    code: 'CRT-002',
    name: 'Prime-Time Max Duration',
    description: 'Maximum booking duration during prime-time hours.',
    category: 'court',
    fields: [
      { key: 'max_minutes_prime', label: 'Max Duration', type: 'number', min: 15, max: 480, suffix: 'minutes' },
    ],
  },
  {
    code: 'CRT-003',
    name: 'Prime-Time Eligibility by Tier',
    description: 'Restrict prime-time booking to specific membership tiers. Tiers are configured after registration.',
    category: 'court',
    fields: [
      { key: 'allow_admin_override', label: 'Allow Admin Override', type: 'select', options: [{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }] },
    ],
  },
  {
    code: 'CRT-005',
    name: 'Reservation Slot Grid',
    description: 'Controls time slot alignment and booking duration limits.',
    category: 'court',
    fields: [
      { key: 'slot_minutes', label: 'Slot Duration', type: 'number', min: 15, max: 120, suffix: 'minutes' },
      { key: 'min_duration_minutes', label: 'Min Booking', type: 'number', min: 15, max: 240, suffix: 'minutes' },
      { key: 'max_duration_minutes', label: 'Max Booking', type: 'number', min: 15, max: 480, suffix: 'minutes' },
    ],
  },
  {
    code: 'CRT-010',
    name: 'Court-Specific Weekly Cap',
    description: 'Limits how many times a member can book the same court per week.',
    category: 'court',
    fields: [
      { key: 'max_per_week_per_account', label: 'Max Per Court/Week', type: 'number', min: 1, max: 20 },
    ],
  },
  {
    code: 'CRT-011',
    name: 'Court Release Time',
    description: 'Courts become bookable at a specific time, a set number of days in advance.',
    category: 'court',
    fields: [
      { key: 'release_time_local', label: 'Release Time', type: 'time' },
      { key: 'days_ahead', label: 'Days Ahead', type: 'number', min: 1, max: 30, suffix: 'days' },
    ],
  },

  // Household Rules
  {
    code: 'HH-001',
    name: 'Max Members Per Address',
    description: 'Limits how many accounts can be registered at a single address.',
    category: 'household',
    fields: [
      { key: 'max_members', label: 'Max Members', type: 'number', min: 1, max: 50 },
    ],
  },
  {
    code: 'HH-002',
    name: 'Household Max Active Reservations',
    description: 'Limits total active reservations across all accounts at an address.',
    category: 'household',
    fields: [
      { key: 'max_active_household', label: 'Max Active', type: 'number', min: 1, max: 50 },
    ],
  },
  {
    code: 'HH-003',
    name: 'Household Prime-Time Cap',
    description: 'Limits total prime-time bookings per week for all accounts at an address.',
    category: 'household',
    fields: [
      { key: 'max_prime_per_week_household', label: 'Max Prime-Time/Week', type: 'number', min: 1, max: 20 },
    ],
  },
];

// Default rule configurations
export const DEFAULT_RULE_CONFIGS: Record<string, RuleEntry> = {
  'ACC-001': { enabled: true, config: { max_active_reservations: 5, count_states: ['confirmed', 'pending'] } },
  'ACC-002': { enabled: true, config: { max_per_week: 10, window_type: 'calendar_week', include_canceled: false } },
  'ACC-003': { enabled: false, config: { max_minutes_per_week: 600, window_type: 'calendar_week' } },
  'ACC-004': { enabled: true, config: { allow_overlap: false, overlap_grace_minutes: 0 } },
  'ACC-005': { enabled: true, config: { max_days_ahead: 14 } },
  'ACC-006': { enabled: true, config: { min_minutes_before_start: 60 } },
  'ACC-007': { enabled: false, config: { cooldown_minutes: 30, only_if_within_minutes_of_start: 240 } },
  'ACC-008': { enabled: true, config: { late_cancel_cutoff_minutes: 120, penalty_type: 'strike', penalty_value: 1 } },
  'ACC-009': { enabled: true, config: { strike_threshold: 3, strike_window_days: 30, lockout_days: 7 } },
  'ACC-010': { enabled: false, config: { max_prime_per_week: 3, window_type: 'calendar_week' } },
  'ACC-011': { enabled: true, config: { max_actions: 10, window_seconds: 60, action_types: ['create', 'cancel'] } },
  'CRT-002': { enabled: true, config: { max_minutes_prime: 60 } },
  'CRT-003': { enabled: false, config: { allowed_tiers: [], allow_admin_override: true } },
  'CRT-005': { enabled: true, config: { slot_minutes: 30, min_duration_minutes: 30, max_duration_minutes: 120 } },
  'CRT-010': { enabled: false, config: { max_per_week_per_account: 3, window_type: 'calendar_week' } },
  'CRT-011': { enabled: false, config: { release_time_local: '07:00', days_ahead: 3 } },
  'HH-001': { enabled: false, config: { max_members: 6, verification_method: 'admin_approval' } },
  'HH-002': { enabled: false, config: { max_active_household: 4 } },
  'HH-003': { enabled: false, config: { max_prime_per_week_household: 3, window_type: 'calendar_week' } },
};

export const DEFAULT_RULES_CONFIG: RulesConfig = {
  generalRules: '',
  restrictionType: 'account',
  rules: { ...DEFAULT_RULE_CONFIGS },

  restrictionsApplyToAdmins: true,
  adminRestrictions: {
    maxBookingsPerWeek: '10',
    maxBookingsUnlimited: true,
    maxDurationHours: '4',
    maxDurationUnlimited: true,
    advanceBookingDays: '30',
    advanceBookingUnlimited: true,
    cancellationNoticeHours: '1',
    cancellationUnlimited: true,
  },

  hasPeakHours: false,
  peakHoursApplyToAdmins: true,
  peakHoursSlots: {},
  peakHoursRestrictions: {
    maxBookingsPerWeek: '2',
    maxBookingsUnlimited: false,
    maxDurationHours: '1.5',
    maxDurationUnlimited: false,
  },

  hasWeekendPolicy: false,
  weekendPolicyApplyToAdmins: true,
  weekendPolicy: {
    maxBookingsPerWeekend: '2',
    maxBookingsUnlimited: false,
    maxDurationHours: '2',
    maxDurationUnlimited: false,
    advanceBookingDays: '7',
    advanceBookingUnlimited: false,
  },
};

// Helper to get rules by category
export function getRulesByCategory(category: RuleMeta['category']): RuleMeta[] {
  return RULE_METADATA.filter(r => r.category === category);
}

// Category display info
export const CATEGORIES = {
  account: {
    title: 'Account Booking Rules',
    instruction: 'Control how members book courts. Enabled rules are enforced automatically \u2014 disabled rules are ignored. All values are pre-set with recommended defaults.',
  },
  cancellation: {
    title: 'Cancellation & No-Show Rules',
    instruction: 'Manage cancellation behavior and accountability. The strike system tracks no-shows and late cancellations, temporarily suspending repeat offenders.',
  },
  court: {
    title: 'Court Scheduling Rules',
    instruction: 'Control court-level scheduling behavior. Per-court settings like operating hours and blackouts are configured in Court Management after registration.',
  },
  household: {
    title: 'Household Rules',
    instruction: 'When using address-based restrictions, these rules limit booking activity per household to ensure fair access across all members at an address.',
  },
} as const;
