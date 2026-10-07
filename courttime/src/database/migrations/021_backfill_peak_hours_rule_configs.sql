-- Migration 021: Backfill peak-hours rule-config enablement
--
-- Purpose:
-- 1) Re-enable ACC-010 / CRT-002 for facilities that already have peak-hours policy rows
-- 2) Seed sane fallback configs from existing facility_rules.peak_hours values
--    so legacy facilities don't require a manual re-save in Admin UI.

WITH latest_peak_policy AS (
  SELECT DISTINCT ON (fr.facility_id)
    fr.facility_id,
    fr.rule_config
  FROM facility_rules fr
  WHERE fr.rule_type = 'peak_hours'
    AND COALESCE(fr.is_active, true) = true
  ORDER BY fr.facility_id, fr.updated_at DESC NULLS LAST, fr.created_at DESC
),
normalized_peak AS (
  SELECT
    facility_id,
    COALESCE(
      NULLIF((rule_config ->> 'max_bookings_per_week'), '')::int,
      NULLIF((rule_config ->> 'maxBookingsPerWeek'), '')::int,
      2
    ) AS max_prime_per_week,
    COALESCE(
      NULLIF((rule_config ->> 'max_duration_hours'), '')::numeric,
      NULLIF((rule_config ->> 'maxDurationHours'), '')::numeric,
      1.5
    ) AS max_duration_hours
  FROM latest_peak_policy
),
acc010_def AS (
  SELECT id AS rule_definition_id
  FROM booking_rule_definitions
  WHERE rule_code = 'ACC-010'
  LIMIT 1
),
crt002_def AS (
  SELECT id AS rule_definition_id
  FROM booking_rule_definitions
  WHERE rule_code = 'CRT-002'
  LIMIT 1
)
INSERT INTO facility_rule_configs (
  facility_id,
  rule_definition_id,
  rule_config,
  is_enabled,
  priority,
  created_at,
  updated_at
)
SELECT
  p.facility_id,
  d.rule_definition_id,
  jsonb_build_object(
    'max_prime_per_week',
    CASE
      WHEN p.max_prime_per_week = -1 THEN -1
      WHEN p.max_prime_per_week < 1 THEN 1
      ELSE p.max_prime_per_week
    END,
    'window_type', 'calendar_week'
  ),
  true,
  100,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM normalized_peak p
CROSS JOIN acc010_def d
ON CONFLICT (facility_id, rule_definition_id) DO UPDATE
SET
  rule_config = EXCLUDED.rule_config,
  is_enabled = true,
  updated_at = CURRENT_TIMESTAMP;

WITH latest_peak_policy AS (
  SELECT DISTINCT ON (fr.facility_id)
    fr.facility_id,
    fr.rule_config
  FROM facility_rules fr
  WHERE fr.rule_type = 'peak_hours'
    AND COALESCE(fr.is_active, true) = true
  ORDER BY fr.facility_id, fr.updated_at DESC NULLS LAST, fr.created_at DESC
),
normalized_peak AS (
  SELECT
    facility_id,
    COALESCE(
      NULLIF((rule_config ->> 'max_duration_hours'), '')::numeric,
      NULLIF((rule_config ->> 'maxDurationHours'), '')::numeric,
      1.5
    ) AS max_duration_hours
  FROM latest_peak_policy
),
crt002_def AS (
  SELECT id AS rule_definition_id
  FROM booking_rule_definitions
  WHERE rule_code = 'CRT-002'
  LIMIT 1
)
INSERT INTO facility_rule_configs (
  facility_id,
  rule_definition_id,
  rule_config,
  is_enabled,
  priority,
  created_at,
  updated_at
)
SELECT
  p.facility_id,
  d.rule_definition_id,
  jsonb_build_object(
    'max_minutes_prime',
    CASE
      WHEN p.max_duration_hours = -1 THEN -1
      ELSE GREATEST(1, ROUND((p.max_duration_hours * 60))::int)
    END
  ),
  true,
  100,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM normalized_peak p
CROSS JOIN crt002_def d
ON CONFLICT (facility_id, rule_definition_id) DO UPDATE
SET
  rule_config = EXCLUDED.rule_config,
  is_enabled = true,
  updated_at = CURRENT_TIMESTAMP;
