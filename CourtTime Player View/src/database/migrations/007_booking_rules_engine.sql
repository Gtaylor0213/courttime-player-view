-- Migration: Booking Rules Engine
-- Implements CourtTime Rules Library v1.0
-- Adds membership tiers, strikes, households, court config, and rule definitions

-- =====================================================
-- 1. MEMBERSHIP TIERS - Separate tier system with booking privileges
-- =====================================================

CREATE TABLE IF NOT EXISTS membership_tiers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    facility_id VARCHAR(50) NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
    tier_name VARCHAR(100) NOT NULL,
    tier_level INTEGER NOT NULL DEFAULT 1,
    -- ACC-005: Advance booking window
    advance_booking_days INTEGER DEFAULT 7,
    -- CRT-003: Prime-time eligibility
    prime_time_eligible BOOLEAN DEFAULT true,
    -- ACC-010: Max prime-time reservations per week
    prime_time_max_per_week INTEGER DEFAULT 2,
    -- ACC-001: Max concurrent active reservations
    max_active_reservations INTEGER DEFAULT 3,
    -- ACC-002: Max reservations per week
    max_reservations_per_week INTEGER DEFAULT 5,
    -- ACC-003: Max hours per week (in minutes for precision)
    max_minutes_per_week INTEGER DEFAULT 600,
    description TEXT,
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(facility_id, tier_name)
);

CREATE INDEX IF NOT EXISTS idx_membership_tiers_facility ON membership_tiers(facility_id);
CREATE INDEX IF NOT EXISTS idx_membership_tiers_default ON membership_tiers(facility_id, is_default) WHERE is_default = true;

CREATE TRIGGER update_membership_tiers_updated_at
BEFORE UPDATE ON membership_tiers
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE membership_tiers IS 'Defines booking privilege tiers separate from membership_type';
COMMENT ON COLUMN membership_tiers.tier_level IS 'Higher level = more privileges (1 = basic, 2 = standard, 3 = premium)';
COMMENT ON COLUMN membership_tiers.max_minutes_per_week IS 'Maximum booking minutes per week (600 = 10 hours)';

-- =====================================================
-- 2. USER TIERS - Assigns users to tiers
-- =====================================================

CREATE TABLE IF NOT EXISTS user_tiers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    facility_id VARCHAR(50) NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
    tier_id UUID NOT NULL REFERENCES membership_tiers(id) ON DELETE CASCADE,
    assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    notes TEXT,
    UNIQUE(user_id, facility_id)
);

CREATE INDEX IF NOT EXISTS idx_user_tiers_user ON user_tiers(user_id);
CREATE INDEX IF NOT EXISTS idx_user_tiers_facility ON user_tiers(facility_id);
CREATE INDEX IF NOT EXISTS idx_user_tiers_tier ON user_tiers(tier_id);

COMMENT ON TABLE user_tiers IS 'Links users to their booking privilege tier at each facility';
COMMENT ON COLUMN user_tiers.expires_at IS 'Optional tier expiration (e.g., for promotional upgrades)';

-- =====================================================
-- 3. ACCOUNT STRIKES - Strike tracking for penalties
-- =====================================================

CREATE TABLE IF NOT EXISTS account_strikes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    facility_id VARCHAR(50) NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
    strike_type VARCHAR(50) NOT NULL CHECK (strike_type IN ('no_show', 'late_cancel', 'violation', 'manual')),
    strike_reason TEXT NOT NULL,
    related_booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
    related_rule_id UUID REFERENCES facility_rules(id) ON DELETE SET NULL,
    issued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    issued_by UUID REFERENCES users(id) ON DELETE SET NULL,
    expires_at TIMESTAMP,
    appealed BOOLEAN DEFAULT false,
    appeal_notes TEXT,
    appeal_date TIMESTAMP,
    revoked BOOLEAN DEFAULT false,
    revoked_at TIMESTAMP,
    revoked_by UUID REFERENCES users(id) ON DELETE SET NULL,
    revoke_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_account_strikes_user ON account_strikes(user_id, facility_id);
CREATE INDEX IF NOT EXISTS idx_account_strikes_active ON account_strikes(user_id, facility_id)
    WHERE revoked = false AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS idx_account_strikes_type ON account_strikes(strike_type);

COMMENT ON TABLE account_strikes IS 'Tracks strikes for no-shows, late cancellations, and rule violations';
COMMENT ON COLUMN account_strikes.strike_type IS 'no_show: missed reservation, late_cancel: canceled too late, violation: rule breach, manual: admin-issued';
COMMENT ON COLUMN account_strikes.expires_at IS 'Strikes can expire after a configurable period';

-- =====================================================
-- 4. HOUSEHOLD GROUPS - Address-based household grouping
-- =====================================================

CREATE TABLE IF NOT EXISTS household_groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    facility_id VARCHAR(50) NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
    hoa_address_id UUID REFERENCES hoa_addresses(id) ON DELETE SET NULL,
    street_address VARCHAR(255) NOT NULL,
    city VARCHAR(100),
    state VARCHAR(50),
    zip_code VARCHAR(20),
    -- HH-001: Max members per address
    max_members INTEGER DEFAULT 6,
    household_name VARCHAR(255),
    -- HH-002: Household max active reservations
    max_active_reservations INTEGER DEFAULT 4,
    -- HH-003: Household prime-time cap per week
    prime_time_max_per_week INTEGER DEFAULT 3,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(facility_id, street_address)
);

CREATE INDEX IF NOT EXISTS idx_household_groups_facility ON household_groups(facility_id);
CREATE INDEX IF NOT EXISTS idx_household_groups_address ON household_groups(street_address);

CREATE TRIGGER update_household_groups_updated_at
BEFORE UPDATE ON household_groups
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE household_groups IS 'Groups users by verified address for household-level booking limits';

-- =====================================================
-- 5. HOUSEHOLD MEMBERS - Links users to households
-- =====================================================

CREATE TABLE IF NOT EXISTS household_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    household_id UUID NOT NULL REFERENCES household_groups(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    is_primary BOOLEAN DEFAULT false,
    verification_status VARCHAR(20) DEFAULT 'pending' CHECK (verification_status IN ('pending', 'verified', 'rejected')),
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    added_by UUID REFERENCES users(id) ON DELETE SET NULL,
    verified_at TIMESTAMP,
    verified_by UUID REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE(household_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_household_members_user ON household_members(user_id);
CREATE INDEX IF NOT EXISTS idx_household_members_household ON household_members(household_id);

COMMENT ON TABLE household_members IS 'Links users to their household group';
COMMENT ON COLUMN household_members.is_primary IS 'Primary account holder for the household';

-- =====================================================
-- 6. COURT OPERATING CONFIG - Per-court schedules and settings
-- =====================================================

CREATE TABLE IF NOT EXISTS court_operating_config (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    court_id UUID NOT NULL REFERENCES courts(id) ON DELETE CASCADE,
    day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
    -- CRT-004: Court operating hours
    is_open BOOLEAN DEFAULT true,
    open_time TIME,
    close_time TIME,
    -- CRT-001: Prime-time schedule
    prime_time_start TIME,
    prime_time_end TIME,
    -- CRT-002: Prime-time max duration (minutes)
    prime_time_max_duration INTEGER DEFAULT 60,
    -- CRT-005: Slot grid (minutes)
    slot_duration INTEGER DEFAULT 30,
    min_duration INTEGER DEFAULT 30,
    max_duration INTEGER DEFAULT 120,
    -- CRT-007: Buffer between reservations (minutes)
    buffer_before INTEGER DEFAULT 0,
    buffer_after INTEGER DEFAULT 5,
    -- CRT-011: Release time for advance bookings
    release_time TIME,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(court_id, day_of_week)
);

CREATE INDEX IF NOT EXISTS idx_court_operating_config_court ON court_operating_config(court_id);

CREATE TRIGGER update_court_operating_config_updated_at
BEFORE UPDATE ON court_operating_config
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE court_operating_config IS 'Per-court, per-day operating hours and booking settings';
COMMENT ON COLUMN court_operating_config.day_of_week IS '0=Sunday, 1=Monday, ..., 6=Saturday';
COMMENT ON COLUMN court_operating_config.release_time IS 'CRT-011: Time when bookings for this day become available';

-- =====================================================
-- 7. COURT BLACKOUTS - Maintenance/event blackout blocks
-- =====================================================

CREATE TABLE IF NOT EXISTS court_blackouts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    court_id UUID REFERENCES courts(id) ON DELETE CASCADE,
    facility_id VARCHAR(50) NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
    blackout_type VARCHAR(50) NOT NULL CHECK (blackout_type IN ('maintenance', 'event', 'tournament', 'holiday', 'weather', 'custom')),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    start_datetime TIMESTAMP NOT NULL,
    end_datetime TIMESTAMP NOT NULL,
    recurrence_rule TEXT,
    visibility VARCHAR(20) DEFAULT 'visible' CHECK (visibility IN ('visible', 'hidden')),
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_court_blackouts_dates ON court_blackouts(facility_id, start_datetime, end_datetime);
CREATE INDEX IF NOT EXISTS idx_court_blackouts_court ON court_blackouts(court_id) WHERE court_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_court_blackouts_active ON court_blackouts(is_active);

CREATE TRIGGER update_court_blackouts_updated_at
BEFORE UPDATE ON court_blackouts
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE court_blackouts IS 'CRT-006: Blocks court availability for maintenance, events, etc.';
COMMENT ON COLUMN court_blackouts.court_id IS 'NULL means applies to all courts at the facility';
COMMENT ON COLUMN court_blackouts.recurrence_rule IS 'RRULE string for recurring blackouts (e.g., weekly maintenance)';

-- =====================================================
-- 8. COURT ALLOWED ACTIVITIES - CRT-008
-- =====================================================

CREATE TABLE IF NOT EXISTS court_allowed_activities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    court_id UUID NOT NULL REFERENCES courts(id) ON DELETE CASCADE,
    activity_type VARCHAR(50) NOT NULL,
    is_allowed BOOLEAN DEFAULT true,
    requires_equipment BOOLEAN DEFAULT false,
    equipment_name VARCHAR(100),
    max_concurrent INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_court_allowed_activities_court ON court_allowed_activities(court_id);

COMMENT ON TABLE court_allowed_activities IS 'CRT-008: Defines allowed booking/activity types per court';
COMMENT ON COLUMN court_allowed_activities.activity_type IS 'e.g., match, drills, practice, clinic, ball_machine, lesson';

-- =====================================================
-- 9. BOOKING RULE DEFINITIONS - Master rule catalog
-- =====================================================

CREATE TABLE IF NOT EXISTS booking_rule_definitions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    rule_code VARCHAR(20) NOT NULL UNIQUE,
    rule_category VARCHAR(20) NOT NULL CHECK (rule_category IN ('account', 'court', 'household')),
    rule_name VARCHAR(255) NOT NULL,
    description TEXT,
    config_schema JSONB NOT NULL,
    default_config JSONB,
    evaluation_order INTEGER NOT NULL,
    failure_message_template TEXT,
    is_system BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_booking_rule_definitions_code ON booking_rule_definitions(rule_code);
CREATE INDEX IF NOT EXISTS idx_booking_rule_definitions_category ON booking_rule_definitions(rule_category);

COMMENT ON TABLE booking_rule_definitions IS 'Master catalog of all booking rules from CourtTime Rules Library';
COMMENT ON COLUMN booking_rule_definitions.config_schema IS 'JSON Schema for validating rule_config';
COMMENT ON COLUMN booking_rule_definitions.failure_message_template IS 'Template with placeholders like {current}/{max}';

-- =====================================================
-- 10. FACILITY RULE CONFIGS - Configured rules per facility
-- =====================================================

CREATE TABLE IF NOT EXISTS facility_rule_configs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    facility_id VARCHAR(50) NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
    rule_definition_id UUID NOT NULL REFERENCES booking_rule_definitions(id) ON DELETE CASCADE,
    rule_config JSONB NOT NULL,
    is_enabled BOOLEAN DEFAULT true,
    applies_to_court_ids UUID[],
    applies_to_tier_ids UUID[],
    priority INTEGER DEFAULT 100,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_facility_rule_configs_facility ON facility_rule_configs(facility_id);
CREATE INDEX IF NOT EXISTS idx_facility_rule_configs_enabled ON facility_rule_configs(facility_id, is_enabled);
CREATE INDEX IF NOT EXISTS idx_facility_rule_configs_rule ON facility_rule_configs(rule_definition_id);

CREATE TRIGGER update_facility_rule_configs_updated_at
BEFORE UPDATE ON facility_rule_configs
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE facility_rule_configs IS 'Per-facility configuration of booking rules';
COMMENT ON COLUMN facility_rule_configs.applies_to_court_ids IS 'NULL means all courts';
COMMENT ON COLUMN facility_rule_configs.applies_to_tier_ids IS 'NULL means all tiers';

-- =====================================================
-- 11. ALTER BOOKINGS TABLE - Add rule tracking columns
-- =====================================================

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS is_prime_time BOOLEAN DEFAULT false;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS rule_overrides JSONB;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS override_reason TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS overridden_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS activity_type VARCHAR(50);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS checked_in BOOLEAN DEFAULT false;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMP;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS no_show_marked BOOLEAN DEFAULT false;

COMMENT ON COLUMN bookings.is_prime_time IS 'Whether this booking falls within prime time hours';
COMMENT ON COLUMN bookings.rule_overrides IS 'JSON array of rule codes that were overridden for this booking';
COMMENT ON COLUMN bookings.override_reason IS 'Admin reason for overriding rules';
COMMENT ON COLUMN bookings.checked_in IS 'Whether user checked in for the reservation';
COMMENT ON COLUMN bookings.no_show_marked IS 'Whether this booking was marked as a no-show';

-- =====================================================
-- 12. ALTER BOOKING_VIOLATIONS TABLE - Enhance for strikes
-- =====================================================

ALTER TABLE booking_violations ADD COLUMN IF NOT EXISTS strike_issued BOOLEAN DEFAULT false;
ALTER TABLE booking_violations ADD COLUMN IF NOT EXISTS strike_id UUID REFERENCES account_strikes(id) ON DELETE SET NULL;

-- =====================================================
-- 13. CANCELLATION TRACKING - For cooldown enforcement
-- =====================================================

CREATE TABLE IF NOT EXISTS booking_cancellations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    facility_id VARCHAR(50) NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
    cancelled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    booking_start_time TIMESTAMP NOT NULL,
    minutes_before_start INTEGER,
    is_late_cancel BOOLEAN DEFAULT false,
    strike_issued BOOLEAN DEFAULT false,
    strike_id UUID REFERENCES account_strikes(id) ON DELETE SET NULL,
    cancel_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_booking_cancellations_user ON booking_cancellations(user_id, facility_id);
CREATE INDEX IF NOT EXISTS idx_booking_cancellations_date ON booking_cancellations(cancelled_at);

COMMENT ON TABLE booking_cancellations IS 'Tracks cancellations for cooldown (ACC-007) and late cancel (ACC-008) enforcement';
COMMENT ON COLUMN booking_cancellations.minutes_before_start IS 'Minutes between cancellation and booking start time';

-- =====================================================
-- 14. RATE LIMIT TRACKING - ACC-011
-- =====================================================

CREATE TABLE IF NOT EXISTS booking_rate_limits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    facility_id VARCHAR(50) NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
    action_type VARCHAR(20) NOT NULL CHECK (action_type IN ('create', 'cancel', 'modify', 'waitlist_join')),
    action_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_booking_rate_limits_user ON booking_rate_limits(user_id, facility_id, action_type);
CREATE INDEX IF NOT EXISTS idx_booking_rate_limits_timestamp ON booking_rate_limits(action_timestamp);

-- Auto-cleanup old rate limit records (older than 1 hour)
CREATE OR REPLACE FUNCTION cleanup_old_rate_limits()
RETURNS void AS $$
BEGIN
    DELETE FROM booking_rate_limits
    WHERE action_timestamp < CURRENT_TIMESTAMP - INTERVAL '1 hour';
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE booking_rate_limits IS 'ACC-011: Tracks booking actions for rate limiting';

-- =====================================================
-- 15. INSERT DEFAULT RULE DEFINITIONS
-- =====================================================

INSERT INTO booking_rule_definitions (rule_code, rule_category, rule_name, description, config_schema, default_config, evaluation_order, failure_message_template) VALUES
-- Account Rules
('ACC-001', 'account', 'Max Active Reservations', 'Limits concurrent active reservations per user',
 '{"type":"object","properties":{"max_active_reservations":{"type":"integer"},"count_states":{"type":"array","items":{"type":"string"}}}}',
 '{"max_active_reservations": 1, "count_states": ["confirmed", "pending"]}',
 100, 'You already have {current}/{max} active reservations. Cancel one to book another.'),

('ACC-002', 'account', 'Max Reservations Per Week', 'Caps weekly booking volume per user',
 '{"type":"object","properties":{"max_per_week":{"type":"integer"},"window_type":{"type":"string"},"include_canceled":{"type":"boolean"}}}',
 '{"max_per_week": 3, "window_type": "calendar_week", "include_canceled": false}',
 101, 'Weekly booking limit reached ({current}/{max}). Next eligible: {nextEligibleDate}.'),

('ACC-003', 'account', 'Max Hours Per Week', 'Limits total bookable minutes per week',
 '{"type":"object","properties":{"max_minutes_per_week":{"type":"integer"},"window_type":{"type":"string"}}}',
 '{"max_minutes_per_week": 180, "window_type": "calendar_week"}',
 102, 'Weekly hours limit reached ({currentMinutes}/{maxMinutes} minutes).'),

('ACC-004', 'account', 'No Overlapping Reservations', 'Prevents booking overlapping time slots',
 '{"type":"object","properties":{"allow_overlap":{"type":"boolean"},"overlap_grace_minutes":{"type":"integer"}}}',
 '{"allow_overlap": false, "overlap_grace_minutes": 0}',
 103, 'This booking overlaps another reservation you have ({otherReservationSummary}).'),

('ACC-005', 'account', 'Advance Booking Window', 'Limits how far in advance users can book',
 '{"type":"object","properties":{"max_days_ahead":{"type":"integer"},"open_time_local":{"type":"string"}}}',
 '{"max_days_ahead": 3, "open_time_local": null}',
 104, 'You can book up to {maxDaysAhead} days in advance. Earliest available: {earliestAllowedDate}.'),

('ACC-006', 'account', 'Minimum Lead Time', 'Prevents last-second bookings',
 '{"type":"object","properties":{"min_minutes_before_start":{"type":"integer"}}}',
 '{"min_minutes_before_start": 15}',
 105, 'Reservations must be made at least {minMinutes} minutes before start time.'),

('ACC-007', 'account', 'Cancellation Cooldown', 'Cooldown period after canceling',
 '{"type":"object","properties":{"cooldown_minutes":{"type":"integer"},"only_if_within_minutes_of_start":{"type":"integer"}}}',
 '{"cooldown_minutes": 30, "only_if_within_minutes_of_start": 240}',
 106, 'You recently canceled a reservation. You can book again after {cooldownEndsAt}.'),

('ACC-008', 'account', 'Late Cancellation Policy', 'Enforces penalties for late cancellations',
 '{"type":"object","properties":{"late_cancel_cutoff_minutes":{"type":"integer"},"penalty_type":{"type":"string"},"penalty_value":{"type":"number"}}}',
 '{"late_cancel_cutoff_minutes": 240, "penalty_type": "strike", "penalty_value": 1}',
 107, 'This cancellation is within {cutoff} minutes of start. Penalty: {penaltySummary}.'),

('ACC-009', 'account', 'No-Show / Strike System', 'Manages strikes and lockouts',
 '{"type":"object","properties":{"strike_threshold":{"type":"integer"},"strike_window_days":{"type":"integer"},"lockout_days":{"type":"integer"}}}',
 '{"strike_threshold": 3, "strike_window_days": 30, "lockout_days": 7}',
 108, 'Your account is locked due to no-show/late-cancel penalties until {lockoutEndsAt}.'),

('ACC-010', 'account', 'Prime-Time Reservations Per Week', 'Limits prime-time bookings per week',
 '{"type":"object","properties":{"max_prime_per_week":{"type":"integer"},"window_type":{"type":"string"}}}',
 '{"max_prime_per_week": 2, "window_type": "calendar_week"}',
 109, 'Prime-time weekly limit reached ({current}/{max}).'),

('ACC-011', 'account', 'Rate Limit Reservation Actions', 'Prevents rapid booking actions (anti-abuse)',
 '{"type":"object","properties":{"max_actions":{"type":"integer"},"window_seconds":{"type":"integer"},"action_types":{"type":"array"}}}',
 '{"max_actions": 10, "window_seconds": 60, "action_types": ["create", "cancel"]}',
 110, 'Too many actions. Please try again in {retryAfterSeconds} seconds.'),

-- Court Rules
('CRT-001', 'court', 'Prime-Time Schedule', 'Defines prime-time windows per court',
 '{"type":"object","properties":{"prime_windows":{"type":"array"}}}',
 '{"prime_windows": []}',
 200, 'This time is designated as prime time for {courtName}.'),

('CRT-002', 'court', 'Prime-Time Max Duration', 'Limits booking duration during prime time',
 '{"type":"object","properties":{"max_minutes_prime":{"type":"integer"}}}',
 '{"max_minutes_prime": 60}',
 201, 'Prime-time bookings on {courtName} are limited to {maxMinutes} minutes.'),

('CRT-003', 'court', 'Prime-Time Eligibility by Tier', 'Restricts prime-time by membership tier',
 '{"type":"object","properties":{"allowed_tiers":{"type":"array"}}}',
 '{"allowed_tiers": [], "allow_admin_override": true}',
 202, 'Your membership tier is not eligible to book prime time on {courtName}.'),

('CRT-004', 'court', 'Court Operating Hours', 'Sets open/close hours per court',
 '{"type":"object","properties":{"open_hours":{"type":"object"},"closed_dates":{"type":"array"}}}',
 '{"open_hours": {}, "closed_dates": []}',
 203, '{courtName} is not available during the selected time due to court hours.'),

('CRT-005', 'court', 'Reservation Slot Grid', 'Enforces start time and duration alignment',
 '{"type":"object","properties":{"slot_minutes":{"type":"integer"},"min_duration_minutes":{"type":"integer"},"max_duration_minutes":{"type":"integer"}}}',
 '{"slot_minutes": 30, "min_duration_minutes": 30, "max_duration_minutes": 120}',
 204, 'Reservations must start on {slotMinutes}-minute increments and be {min}-{max} minutes.'),

('CRT-006', 'court', 'Blackout Blocks', 'Blocks courts for maintenance/events',
 '{"type":"object","properties":{"blocks":{"type":"array"},"visibility":{"type":"string"}}}',
 '{"blocks": [], "visibility": "visible_reason"}',
 205, '{courtName} is unavailable during this time ({reason}).'),

('CRT-007', 'court', 'Buffer Time Between Reservations', 'Adds turnover buffer',
 '{"type":"object","properties":{"buffer_before_minutes":{"type":"integer"},"buffer_after_minutes":{"type":"integer"}}}',
 '{"buffer_before_minutes": 0, "buffer_after_minutes": 5}',
 206, 'This time is unavailable due to {buffer} minute buffer between reservations.'),

('CRT-008', 'court', 'Allowed Activities / Booking Types', 'Restricts court usage types',
 '{"type":"object","properties":{"allowed_activity_types":{"type":"array"},"activity_required":{"type":"boolean"}}}',
 '{"allowed_activity_types": ["match", "practice", "lesson"], "activity_required": false}',
 207, 'Selected activity type is not allowed on {courtName}.'),

('CRT-009', 'court', 'Sub-Amenity Inventory Limit', 'Limits concurrent sub-amenity use',
 '{"type":"object","properties":{"sub_amenity_type":{"type":"string"},"max_concurrent":{"type":"integer"},"scope":{"type":"string"}}}',
 '{"sub_amenity_type": "ball_machine", "max_concurrent": 2, "scope": "club_wide"}',
 208, 'All {subAmenityType} units are reserved for that time.'),

('CRT-010', 'court', 'Court-Specific Weekly Cap', 'Limits bookings on specific court',
 '{"type":"object","properties":{"max_per_week_per_account":{"type":"integer"},"window_type":{"type":"string"}}}',
 '{"max_per_week_per_account": 2, "window_type": "calendar_week"}',
 209, 'You''ve reached the weekly limit for {courtName} ({current}/{max}).'),

('CRT-011', 'court', 'Court Release Time', 'Sets daily booking release time',
 '{"type":"object","properties":{"release_time_local":{"type":"string"},"days_ahead":{"type":"integer"}}}',
 '{"release_time_local": "07:00", "days_ahead": 3}',
 210, 'Bookings for {targetDate} on {courtName} open at {releaseTime}.'),

('CRT-012', 'court', 'Court-Specific Cancellation Deadline', 'Court-specific cancel notice',
 '{"type":"object","properties":{"cancel_cutoff_minutes":{"type":"integer"},"penalty_type":{"type":"string"},"penalty_value":{"type":"number"}}}',
 '{"cancel_cutoff_minutes": 120, "penalty_type": "strike", "penalty_value": 1}',
 211, 'This reservation is inside the cancellation window for {courtName}.'),

-- Household Rules
('HH-001', 'household', 'Max Members Per Address', 'Limits accounts per household',
 '{"type":"object","properties":{"max_members":{"type":"integer"},"verification_method":{"type":"string"}}}',
 '{"max_members": 6, "verification_method": "admin_approval"}',
 300, 'This address has reached the maximum of {max} active members ({current}/{max}).'),

('HH-002', 'household', 'Household Max Active Reservations', 'Limits concurrent household reservations',
 '{"type":"object","properties":{"max_active_household":{"type":"integer"}}}',
 '{"max_active_household": 2}',
 301, 'Your household has reached its active reservation limit ({current}/{max}).'),

('HH-003', 'household', 'Household Prime-Time Cap', 'Limits household prime-time bookings',
 '{"type":"object","properties":{"max_prime_per_week_household":{"type":"integer"},"window_type":{"type":"string"}}}',
 '{"max_prime_per_week_household": 3, "window_type": "calendar_week"}',
 302, 'Your household has reached its prime-time weekly limit ({current}/{max}).')

ON CONFLICT (rule_code) DO UPDATE SET
    rule_name = EXCLUDED.rule_name,
    description = EXCLUDED.description,
    config_schema = EXCLUDED.config_schema,
    default_config = EXCLUDED.default_config,
    failure_message_template = EXCLUDED.failure_message_template;

-- =====================================================
-- 16. HELPER FUNCTIONS
-- =====================================================

-- Function to get user's active strike count
CREATE OR REPLACE FUNCTION get_active_strike_count(
    p_user_id UUID,
    p_facility_id VARCHAR(50),
    p_window_days INTEGER DEFAULT 30
) RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_count
    FROM account_strikes
    WHERE user_id = p_user_id
      AND facility_id = p_facility_id
      AND revoked = false
      AND issued_at >= CURRENT_TIMESTAMP - (p_window_days || ' days')::INTERVAL
      AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP);

    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- Function to check if user is locked out
CREATE OR REPLACE FUNCTION is_user_locked_out(
    p_user_id UUID,
    p_facility_id VARCHAR(50)
) RETURNS BOOLEAN AS $$
DECLARE
    v_strike_count INTEGER;
    v_threshold INTEGER;
    v_window_days INTEGER;
BEGIN
    -- Get facility's strike threshold config (default: 3 strikes in 30 days)
    SELECT
        COALESCE((rule_config->>'strike_threshold')::INTEGER, 3),
        COALESCE((rule_config->>'strike_window_days')::INTEGER, 30)
    INTO v_threshold, v_window_days
    FROM facility_rule_configs frc
    JOIN booking_rule_definitions brd ON frc.rule_definition_id = brd.id
    WHERE frc.facility_id = p_facility_id
      AND brd.rule_code = 'ACC-009'
      AND frc.is_enabled = true
    LIMIT 1;

    -- Default if no config found
    IF v_threshold IS NULL THEN
        v_threshold := 3;
        v_window_days := 30;
    END IF;

    -- Get active strike count
    v_strike_count := get_active_strike_count(p_user_id, p_facility_id, v_window_days);

    RETURN v_strike_count >= v_threshold;
END;
$$ LANGUAGE plpgsql;

-- Function to get user's tier at a facility
CREATE OR REPLACE FUNCTION get_user_tier(
    p_user_id UUID,
    p_facility_id VARCHAR(50)
) RETURNS membership_tiers AS $$
DECLARE
    v_tier membership_tiers;
BEGIN
    -- First try to get explicitly assigned tier
    SELECT mt.* INTO v_tier
    FROM user_tiers ut
    JOIN membership_tiers mt ON ut.tier_id = mt.id
    WHERE ut.user_id = p_user_id
      AND ut.facility_id = p_facility_id
      AND (ut.expires_at IS NULL OR ut.expires_at > CURRENT_TIMESTAMP);

    -- If no explicit tier, get default tier
    IF v_tier IS NULL THEN
        SELECT * INTO v_tier
        FROM membership_tiers
        WHERE facility_id = p_facility_id
          AND is_default = true;
    END IF;

    RETURN v_tier;
END;
$$ LANGUAGE plpgsql;

-- Function to check if time is prime time for a court
CREATE OR REPLACE FUNCTION is_prime_time(
    p_court_id UUID,
    p_booking_date DATE,
    p_start_time TIME,
    p_end_time TIME
) RETURNS BOOLEAN AS $$
DECLARE
    v_day_of_week INTEGER;
    v_config court_operating_config;
BEGIN
    v_day_of_week := EXTRACT(DOW FROM p_booking_date);

    SELECT * INTO v_config
    FROM court_operating_config
    WHERE court_id = p_court_id
      AND day_of_week = v_day_of_week;

    IF v_config IS NULL OR v_config.prime_time_start IS NULL THEN
        RETURN false;
    END IF;

    -- Check if booking overlaps prime time window
    RETURN (p_start_time < v_config.prime_time_end AND p_end_time > v_config.prime_time_start);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_active_strike_count IS 'Returns count of active (non-revoked, non-expired) strikes';
COMMENT ON FUNCTION is_user_locked_out IS 'Checks if user has exceeded strike threshold';
COMMENT ON FUNCTION get_user_tier IS 'Gets user''s assigned tier or facility default';
COMMENT ON FUNCTION is_prime_time IS 'Checks if a booking time falls within prime time hours';

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================
