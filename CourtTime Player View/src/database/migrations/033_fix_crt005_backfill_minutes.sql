-- Migration 033: Correct CRT-005 backfill for facilities with hour-based flat values

WITH target_rules AS (
  SELECT
    f.id AS facility_id,
    CASE
      WHEN NULLIF((f.booking_rules::jsonb ->> 'maxReservationDurationMinutes'), '') IS NOT NULL
        AND (f.booking_rules::jsonb ->> 'maxReservationDurationMinutes') ~ '^[0-9]+$'
        AND ((f.booking_rules::jsonb ->> 'maxReservationDurationMinutes')::int) >= 15
        THEN (f.booking_rules::jsonb ->> 'maxReservationDurationMinutes')::int
      WHEN NULLIF((f.booking_rules::jsonb ->> 'maxBookingDurationHours'), '') IS NOT NULL
        AND (f.booking_rules::jsonb ->> 'maxBookingDurationHours') ~ '^[0-9]+(\\.[0-9]+)?$'
        THEN GREATEST(15, ROUND(((f.booking_rules::jsonb ->> 'maxBookingDurationHours')::numeric) * 60)::int)
      ELSE 120
    END AS max_duration_minutes
  FROM facilities f
  WHERE f.booking_rules IS NOT NULL
),
crt_def AS (
  SELECT id AS rule_definition_id
  FROM booking_rule_definitions
  WHERE rule_code = 'CRT-005'
)
UPDATE facility_rule_configs frc
SET
  rule_config = jsonb_build_object('max_duration_minutes', tr.max_duration_minutes),
  is_enabled = true,
  updated_at = CURRENT_TIMESTAMP
FROM target_rules tr
CROSS JOIN crt_def cd
WHERE frc.facility_id = tr.facility_id
  AND frc.rule_definition_id = cd.rule_definition_id;
