-- Flip admin_book_for_others to enabled-by-default. Backfill every existing
-- facility that isn't already on; new facilities are seeded enabled at
-- creation time (see facilityService.ts seedDefaultOnFeatureFlags).

INSERT INTO facility_features (facility_id, feature_key, is_enabled, updated_at)
SELECT id, 'admin_book_for_others', true, NOW()
FROM facilities
ON CONFLICT (facility_id, feature_key) DO UPDATE SET is_enabled = true, updated_at = NOW()
WHERE facility_features.is_enabled = false;
