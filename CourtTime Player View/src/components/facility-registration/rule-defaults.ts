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
  days: number[];
  appliesToAllCourts: boolean;
  selectedCourtIds: string[];
  rules: {
    maxBookingsPerDay: string;
    maxBookingsPerDayUnlimited: boolean;
    maxBookingsPerDayHousehold: string;
    maxBookingsPerDayHouseholdUnlimited: boolean;
    maxBookingsPerWeek: string;
    maxBookingsPerWeekUnlimited: boolean;
    maxBookingsPerWeekHousehold: string;
    maxBookingsPerWeekHouseholdUnlimited: boolean;
    maxDurationHours: string;
    maxDurationUnlimited: boolean;
  };
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
  peakHoursSlots: PeakHourSlot[];
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
    code: 'ACC-010',
    name: 'Peak-Hours Per Week Limit',
    description: 'Limits peak-hours bookings per member per week.',
    category: 'account',
    fields: [
      { key: 'max_prime_per_week', label: 'Max Peak-Hours/Week', type: 'number', min: 1, max: 20 },
    ],
  },

  // No-Show Rules
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
  // Court Scheduling Rules
  {
    code: 'CRT-002',
    name: 'Peak-Hours Max Duration',
    description: 'Maximum booking duration during peak-hours hours.',
    category: 'court',
    fields: [
      { key: 'max_minutes_prime', label: 'Max Duration', type: 'number', min: 15, max: 480, suffix: 'minutes' },
    ],
  },
  {
    code: 'CRT-003',
    name: 'Peak-Hours Eligibility by Tier',
    description: 'Restrict peak-hours booking to specific membership tiers. Tiers are configured after registration.',
    category: 'court',
    fields: [
      { key: 'allow_admin_override', label: 'Allow Admin Override', type: 'select', options: [{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }] },
    ],
  },
  {
    code: 'CRT-005',
    name: 'Max Reservation Duration',
    description: 'Limits the maximum booking duration for a single reservation.',
    category: 'court',
    fields: [
      { key: 'max_duration_minutes', label: 'Max Booking', type: 'number', min: 15, max: 480, suffix: 'minutes' },
    ],
  },
  {
    code: 'CRT-008',
    name: 'Allowed Booking Types',
    description: 'Restrict which booking types (singles, doubles, lessons, etc.) are available at this facility.',
    category: 'court',
    fields: [],
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
    name: 'Max Accounts Per Address',
    description: 'Limits how many member accounts can join a facility from the same street address. When off, there is no limit.',
    category: 'household',
    fields: [
      { key: 'max_members', label: 'Max Accounts', type: 'number', min: 1, max: 50 },
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
    name: 'Household Peak-Hours Cap',
    description: 'Limits total peak-hours bookings per week for all accounts at an address.',
    category: 'household',
    fields: [
      { key: 'max_prime_per_week_household', label: 'Max Peak-Hours/Week', type: 'number', min: 1, max: 20 },
    ],
  },
];

// Default rule configurations
export const DEFAULT_RULE_CONFIGS: Record<string, RuleEntry> = {
  'ACC-001': { enabled: false, config: { max_active_reservations: '', count_states: ['confirmed', 'pending'] } },
  'ACC-002': {
    enabled: false,
    config: {
      max_per_week: '',
      window_type: 'calendar_week',
      include_canceled: false,
      max_per_day_enabled: false,
      max_per_day: '',
    },
  },
  'ACC-003': { enabled: false, config: { max_minutes_per_week: '', window_type: 'calendar_week' } },
  'ACC-004': { enabled: false, config: { allow_overlap: false, overlap_grace_minutes: 0 } },
  'ACC-005': { enabled: false, config: { max_days_ahead: '' } },
  'ACC-006': { enabled: false, config: { min_minutes_before_start: '' } },
  'ACC-009': { enabled: false, config: { strike_threshold: '', strike_window_days: '', lockout_days: '' } },
  'ACC-010': { enabled: false, config: { max_prime_per_week: '', window_type: 'calendar_week' } },
  'CRT-002': { enabled: false, config: { max_minutes_prime: '' } },
  'CRT-003': { enabled: false, config: { allowed_tiers: [], allow_admin_override: true } },
  'CRT-005': { enabled: false, config: { max_duration_minutes: '' } },
  'CRT-008': { enabled: false, config: { allowed_types: ['singles', 'doubles', 'lesson', 'clinic', 'open_play', 'tournament', 'practice', 'social', 'other'] } },
  'CRT-010': { enabled: false, config: { max_per_week_per_account: '', window_type: 'calendar_week' } },
  'CRT-011': { enabled: false, config: { release_time_local: '', days_ahead: '' } },
  'HH-001': { enabled: false, config: { max_members: '', verification_method: 'admin_approval' } },
  'HH-002': { enabled: false, config: { max_active_household: '' } },
  'HH-003': {
    enabled: false,
    config: {
      max_per_week_household: '',
      max_per_day_household_enabled: false,
      max_per_day_household: '',
      window_type: 'calendar_week',
    },
  },
};

export const DEFAULT_RULES_CONFIG: RulesConfig = {
  generalRules: '',
  restrictionType: 'account',
  rules: { ...DEFAULT_RULE_CONFIGS },

  restrictionsApplyToAdmins: false,
  adminRestrictions: {
    maxBookingsPerWeek: '10',
    maxBookingsUnlimited: true,
    maxDurationHours: '4',
    maxDurationUnlimited: true,
    advanceBookingDays: '30',
    advanceBookingUnlimited: true,
  },

  hasPeakHours: false,
  peakHoursApplyToAdmins: false,
  peakHoursSlots: [],
  peakHoursRestrictions: {
    maxBookingsPerWeek: '2',
    maxBookingsUnlimited: false,
    maxDurationHours: '1.5',
    maxDurationUnlimited: false,
  },

  hasWeekendPolicy: false,
  weekendPolicyApplyToAdmins: false,
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
    instruction: 'Control how members book courts. Leave a rule off to disable it, or turn it on and enter the exact value you want enforced.',
  },
  cancellation: {
    title: 'No-Show Rules',
    instruction: 'Manage no-show accountability. The strike system tracks no-shows and can temporarily suspend repeat offenders.',
  },
  court: {
    title: 'Court Scheduling Rules',
    instruction: 'Control court-level scheduling behavior. Per-court settings like operating hours and blackouts are configured in Court Management after registration.',
  },
  household: {
    title: 'Membership & Household Rules',
    instruction: 'Control how many accounts may join from the same address and how booking limits apply per household.',
  },
} as const;
