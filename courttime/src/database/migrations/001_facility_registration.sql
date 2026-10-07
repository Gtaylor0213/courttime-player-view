-- Migration: Facility Registration System
-- Adds support for super admins, facility admins, split courts, facility rules, and HOA addresses

-- =====================================================
-- 1. ADD SUPER ADMIN SUPPORT TO USERS TABLE
-- =====================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN DEFAULT false;

COMMENT ON COLUMN users.is_super_admin IS 'Indicates if user is the super admin who created the facility';

-- =====================================================
-- 2. CREATE FACILITY_ADMINS TABLE (Junction Table)
-- =====================================================

CREATE TABLE IF NOT EXISTS facility_admins (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    facility_id VARCHAR(50) NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
    is_super_admin BOOLEAN DEFAULT false,
    invited_by UUID REFERENCES users(id) ON DELETE SET NULL,
    invitation_email VARCHAR(255),
    invitation_sent_at TIMESTAMP,
    invitation_accepted_at TIMESTAMP,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'pending', 'suspended', 'removed')),
    permissions JSONB DEFAULT '{"manage_courts": true, "manage_bookings": true, "manage_admins": true, "manage_bulletin": true, "manage_rules": true}'::jsonb,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, facility_id)
);

CREATE INDEX idx_facility_admins_user ON facility_admins(user_id);
CREATE INDEX idx_facility_admins_facility ON facility_admins(facility_id);
CREATE INDEX idx_facility_admins_status ON facility_admins(status);

CREATE TRIGGER update_facility_admins_updated_at
BEFORE UPDATE ON facility_admins
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE facility_admins IS 'Links admin users to facilities they manage. One super admin per facility, plus additional admins.';
COMMENT ON COLUMN facility_admins.is_super_admin IS 'True for the admin who created the facility';
COMMENT ON COLUMN facility_admins.permissions IS 'JSON object defining admin permissions';

-- =====================================================
-- 3. UPDATE COURTS TABLE FOR SPLIT COURTS
-- =====================================================

ALTER TABLE courts ADD COLUMN IF NOT EXISTS court_rules TEXT;
ALTER TABLE courts ADD COLUMN IF NOT EXISTS parent_court_id UUID REFERENCES courts(id) ON DELETE CASCADE;
ALTER TABLE courts ADD COLUMN IF NOT EXISTS split_configuration JSONB;
ALTER TABLE courts ADD COLUMN IF NOT EXISTS is_split_court BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_courts_parent ON courts(parent_court_id);

COMMENT ON COLUMN courts.court_rules IS 'Court-specific rules that override facility-wide rules';
COMMENT ON COLUMN courts.parent_court_id IS 'References parent court for split courts (e.g., Court 3a references Court 3)';
COMMENT ON COLUMN courts.split_configuration IS 'JSON configuration for split courts: {"split_into": ["3a", "3b"], "split_type": "pickleball"}';
COMMENT ON COLUMN courts.is_split_court IS 'True if this court can be split into multiple sub-courts';

-- =====================================================
-- 4. CREATE FACILITY_RULES TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS facility_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    facility_id VARCHAR(50) NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
    rule_type VARCHAR(50) NOT NULL, -- 'booking_limit', 'cancellation_policy', 'usage_rules', 'peak_hours'
    rule_name VARCHAR(255) NOT NULL,
    rule_description TEXT,
    rule_config JSONB NOT NULL, -- Flexible JSON for different rule types
    is_active BOOLEAN DEFAULT true,
    applies_to_courts UUID[], -- Array of court IDs, NULL means all courts
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_facility_rules_facility ON facility_rules(facility_id);
CREATE INDEX idx_facility_rules_type ON facility_rules(rule_type);
CREATE INDEX idx_facility_rules_active ON facility_rules(is_active);

CREATE TRIGGER update_facility_rules_updated_at
BEFORE UPDATE ON facility_rules
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE facility_rules IS 'Stores facility-wide and court-specific rules for bookings, usage, and policies';
COMMENT ON COLUMN facility_rules.rule_type IS 'Type of rule: booking_limit, cancellation_policy, usage_rules, peak_hours';
COMMENT ON COLUMN facility_rules.rule_config IS 'JSON configuration for the rule. Examples:
- booking_limit: {"max_bookings_per_week": 3, "max_duration_hours": 2, "per_household": true}
- cancellation_policy: {"notice_hours": 24, "penalty_type": "none"}
- peak_hours: {"days": ["monday", "wednesday"], "start_time": "18:00", "end_time": "21:00", "max_bookings": 1}
- usage_rules: {"text": "No food on courts", "enforcement": "warning"}';
COMMENT ON COLUMN facility_rules.applies_to_courts IS 'Array of court UUIDs. NULL means applies to all courts in facility.';

-- =====================================================
-- 5. CREATE HOA_ADDRESSES TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS hoa_addresses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    facility_id VARCHAR(50) NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
    street_address VARCHAR(255) NOT NULL,
    city VARCHAR(100),
    state VARCHAR(50),
    zip_code VARCHAR(20),
    household_name VARCHAR(255), -- Optional household identifier
    is_active BOOLEAN DEFAULT true,
    notes TEXT,
    uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(facility_id, street_address)
);

CREATE INDEX idx_hoa_addresses_facility ON hoa_addresses(facility_id);
CREATE INDEX idx_hoa_addresses_address ON hoa_addresses(street_address);
CREATE INDEX idx_hoa_addresses_active ON hoa_addresses(is_active);

CREATE TRIGGER update_hoa_addresses_updated_at
BEFORE UPDATE ON hoa_addresses
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE hoa_addresses IS 'Stores HOA household addresses for booking restrictions and validation';
COMMENT ON COLUMN hoa_addresses.household_name IS 'Optional: Family name or household identifier';
COMMENT ON COLUMN hoa_addresses.is_active IS 'Inactive addresses are not considered for booking restrictions';

-- =====================================================
-- 6. UPDATE FACILITIES TABLE
-- =====================================================

ALTER TABLE facilities ADD COLUMN IF NOT EXISTS general_rules TEXT;
ALTER TABLE facilities ADD COLUMN IF NOT EXISTS contact_name VARCHAR(255);
ALTER TABLE facilities ADD COLUMN IF NOT EXISTS cancellation_policy TEXT;
ALTER TABLE facilities ADD COLUMN IF NOT EXISTS booking_rules TEXT;
ALTER TABLE facilities ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'pending', 'suspended', 'closed'));

COMMENT ON COLUMN facilities.general_rules IS 'General usage rules text (e.g., "No food on courts", "Proper attire required")';
COMMENT ON COLUMN facilities.contact_name IS 'Primary contact person name';
COMMENT ON COLUMN facilities.cancellation_policy IS 'Facility cancellation policy description';
COMMENT ON COLUMN facilities.booking_rules IS 'Facility-wide booking rules description';
COMMENT ON COLUMN facilities.status IS 'Facility operational status';

-- =====================================================
-- 7. CREATE BOOKING_VIOLATIONS TABLE (for tracking rule violations)
-- =====================================================

CREATE TABLE IF NOT EXISTS booking_violations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_id UUID REFERENCES bookings(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    facility_id VARCHAR(50) NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
    rule_id UUID REFERENCES facility_rules(id) ON DELETE SET NULL,
    violation_type VARCHAR(50) NOT NULL, -- 'booking_limit_exceeded', 'invalid_address', 'peak_hour_limit'
    violation_description TEXT NOT NULL,
    detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved BOOLEAN DEFAULT false,
    resolved_at TIMESTAMP,
    resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    notes TEXT
);

CREATE INDEX idx_booking_violations_user ON booking_violations(user_id);
CREATE INDEX idx_booking_violations_facility ON booking_violations(facility_id);
CREATE INDEX idx_booking_violations_resolved ON booking_violations(resolved);

COMMENT ON TABLE booking_violations IS 'Tracks booking rule violations for reporting and enforcement';

-- =====================================================
-- 8. CREATE FUNCTION TO CHECK SPLIT COURT AVAILABILITY
-- =====================================================

CREATE OR REPLACE FUNCTION check_split_court_availability(
    p_court_id UUID,
    p_booking_date DATE,
    p_start_time TIME,
    p_end_time TIME
) RETURNS BOOLEAN AS $$
DECLARE
    v_parent_court_id UUID;
    v_conflicting_bookings INTEGER;
BEGIN
    -- Check if this is a split court (has parent)
    SELECT parent_court_id INTO v_parent_court_id
    FROM courts
    WHERE id = p_court_id;

    -- If this is a split court, check if parent court is booked
    IF v_parent_court_id IS NOT NULL THEN
        SELECT COUNT(*) INTO v_conflicting_bookings
        FROM bookings
        WHERE court_id = v_parent_court_id
        AND booking_date = p_booking_date
        AND status != 'cancelled'
        AND (
            (start_time <= p_start_time AND end_time > p_start_time)
            OR (start_time < p_end_time AND end_time >= p_end_time)
            OR (start_time >= p_start_time AND end_time <= p_end_time)
        );

        IF v_conflicting_bookings > 0 THEN
            RETURN false;
        END IF;
    END IF;

    -- If this is a parent court, check if any split courts are booked
    SELECT COUNT(*) INTO v_conflicting_bookings
    FROM bookings b
    JOIN courts c ON b.court_id = c.id
    WHERE c.parent_court_id = p_court_id
    AND b.booking_date = p_booking_date
    AND b.status != 'cancelled'
    AND (
        (b.start_time <= p_start_time AND b.end_time > p_start_time)
        OR (b.start_time < p_end_time AND b.end_time >= p_end_time)
        OR (b.start_time >= p_start_time AND b.end_time <= p_end_time)
    );

    IF v_conflicting_bookings > 0 THEN
        RETURN false;
    END IF;

    RETURN true;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION check_split_court_availability IS 'Checks if a court (or split court) is available, considering parent/child court relationships';

-- =====================================================
-- 9. CREATE INDEXES FOR NEW COLUMNS
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_users_super_admin ON users(is_super_admin) WHERE is_super_admin = true;
CREATE INDEX IF NOT EXISTS idx_facilities_status ON facilities(status);

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================
