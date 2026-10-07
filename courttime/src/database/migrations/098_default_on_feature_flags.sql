-- Flip week_month_view, court_waivers, player_level_groups, and
-- drag_reschedule_reservations to enabled-by-default. Backfill every existing
-- facility that isn't already on; new facilities are seeded enabled at
-- creation time (see facilityService.ts seedDefaultOnFeatureFlags).

INSERT INTO facility_features (facility_id, feature_key, is_enabled, updated_at)
SELECT id, 'week_month_view', true, NOW()
FROM facilities
ON CONFLICT (facility_id, feature_key) DO UPDATE SET is_enabled = true, updated_at = NOW()
WHERE facility_features.is_enabled = false;

INSERT INTO facility_features (facility_id, feature_key, is_enabled, updated_at)
SELECT id, 'court_waivers', true, NOW()
FROM facilities
ON CONFLICT (facility_id, feature_key) DO UPDATE SET is_enabled = true, updated_at = NOW()
WHERE facility_features.is_enabled = false;

INSERT INTO facility_features (facility_id, feature_key, is_enabled, updated_at)
SELECT id, 'player_level_groups', true, NOW()
FROM facilities
ON CONFLICT (facility_id, feature_key) DO UPDATE SET is_enabled = true, updated_at = NOW()
WHERE facility_features.is_enabled = false;

INSERT INTO facility_features (facility_id, feature_key, is_enabled, updated_at)
SELECT id, 'drag_reschedule_reservations', true, NOW()
FROM facilities
ON CONFLICT (facility_id, feature_key) DO UPDATE SET is_enabled = true, updated_at = NOW()
WHERE facility_features.is_enabled = false;
