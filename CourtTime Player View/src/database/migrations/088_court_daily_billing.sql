-- Let admins charge a flat day rate for a court instead of an hourly rate.
-- billing_mode defaults to 'hourly' so every existing court keeps its current
-- pricing behavior unchanged. daily_rate_cents is only used when a court is
-- switched to 'daily'.
ALTER TABLE courts
  ADD COLUMN IF NOT EXISTS billing_mode VARCHAR(10) NOT NULL DEFAULT 'hourly',
  ADD COLUMN IF NOT EXISTS daily_rate_cents INTEGER;

ALTER TABLE courts DROP CONSTRAINT IF EXISTS courts_billing_mode_check;
ALTER TABLE courts ADD CONSTRAINT courts_billing_mode_check
  CHECK (billing_mode IN ('hourly', 'daily'));

-- Explicitly seed the new flag as disabled for every existing club. New clubs
-- remain disabled because feature flags default to false when no row exists.
INSERT INTO facility_features (facility_id, feature_key, is_enabled, updated_at)
SELECT id, 'court_daily_billing', false, NOW()
FROM facilities
ON CONFLICT (facility_id, feature_key) DO NOTHING;
