-- Migration: Admin-only courts
-- Adds support for courts that only admins/sub-admins can book online

ALTER TABLE courts
ADD COLUMN IF NOT EXISTS is_admin_only BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_courts_is_admin_only
ON courts (facility_id, is_admin_only);

COMMENT ON COLUMN courts.is_admin_only IS 'When true, only facility admins/sub-admins can book this court; members are rejected';

-- Explicitly seed the new flag as disabled for every existing club. New clubs
-- remain disabled because feature flags default to false when no row exists.
INSERT INTO facility_features (facility_id, feature_key, is_enabled, updated_at)
SELECT id, 'admin_only_courts', false, NOW()
FROM facilities
ON CONFLICT (facility_id, feature_key) DO NOTHING;
