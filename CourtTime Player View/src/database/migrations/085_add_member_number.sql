-- Migration: Add optional per-facility member number
-- Lets a facility require members to record their club-issued member number,
-- gated behind the 'member_number' feature flag (facility_features).

ALTER TABLE facility_memberships
ADD COLUMN IF NOT EXISTS member_number VARCHAR(50);

CREATE INDEX IF NOT EXISTS idx_facility_memberships_member_number ON facility_memberships(facility_id, member_number);

-- Explicitly seed the new flag as disabled for every existing club. New clubs
-- remain disabled because feature flags default to false when no row exists.
INSERT INTO facility_features (facility_id, feature_key, is_enabled, updated_at)
SELECT id, 'member_number', false, NOW()
FROM facilities
ON CONFLICT (facility_id, feature_key) DO NOTHING;
