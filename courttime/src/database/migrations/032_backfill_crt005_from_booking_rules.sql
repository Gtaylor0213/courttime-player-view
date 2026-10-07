-- Migration 032: Backfill CRT-005 max duration from facilities.booking_rules
-- Keeps rules engine config aligned with Booking Management values (flat booking_rules shape).

WITH target_rules AS (
  SELECT
    f.id AS facility_id,
    GREATEST(
      15,
      COALESCE(NULLIF((f.booking_rules::jsonb ->> 'maxReservationDurationMinutes'), '')::int, 120)
    ) AS max_duration_minutes
  FROM facilities f
  WHERE f.booking_rules IS NOT NULL
),
crt_def AS (
  SELECT id AS rule_definition_id
  FROM booking_rule_definitions
  WHERE rule_code = 'CRT-005'
)
INSERT INTO facility_rule_configs (
  facility_id,
  rule_definition_id,
  rule_config,
  is_enabled
)
SELECT
  tr.facility_id,
  cd.rule_definition_id,
  jsonb_build_object('max_duration_minutes', tr.max_duration_minutes),
  true
FROM target_rules tr
CROSS JOIN crt_def cd
ON CONFLICT (facility_id, rule_definition_id)
DO UPDATE SET
  rule_config = EXCLUDED.rule_config,
  is_enabled = true,
  updated_at = CURRENT_TIMESTAMP;
