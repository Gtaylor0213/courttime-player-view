-- Migration 034: Fix CRT-005 duration for facilities where "minutes" field stores hour-like values
-- If maxReservationDurationMinutes is between 1 and 12, treat as hours.

WITH normalized AS (
  SELECT
    f.id AS facility_id,
    CASE
      WHEN NULLIF((f.booking_rules::jsonb ->> 'maxReservationDurationMinutes'), '') IS NOT NULL
        AND (f.booking_rules::jsonb ->> 'maxReservationDurationMinutes') ~ '^[0-9]+(\\.[0-9]+)?$'
        AND ((f.booking_rules::jsonb ->> 'maxReservationDurationMinutes')::numeric) > 0
        AND ((f.booking_rules::jsonb ->> 'maxReservationDurationMinutes')::numeric) <= 12
        THEN ROUND(((f.booking_rules::jsonb ->> 'maxReservationDurationMinutes')::numeric) * 60)::int
      WHEN NULLIF((f.booking_rules::jsonb ->> 'maxReservationDurationMinutes'), '') IS NOT NULL
        AND (f.booking_rules::jsonb ->> 'maxReservationDurationMinutes') ~ '^[0-9]+$'
        THEN (f.booking_rules::jsonb ->> 'maxReservationDurationMinutes')::int
      WHEN NULLIF((f.booking_rules::jsonb ->> 'maxBookingDurationHours'), '') IS NOT NULL
        AND (f.booking_rules::jsonb ->> 'maxBookingDurationHours') ~ '^[0-9]+(\\.[0-9]+)?$'
        THEN ROUND(((f.booking_rules::jsonb ->> 'maxBookingDurationHours')::numeric) * 60)::int
      ELSE NULL
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
  rule_config = jsonb_build_object('max_duration_minutes', GREATEST(15, n.max_duration_minutes)),
  is_enabled = true,
  updated_at = CURRENT_TIMESTAMP
FROM normalized n
CROSS JOIN crt_def cd
WHERE frc.facility_id = n.facility_id
  AND frc.rule_definition_id = cd.rule_definition_id
  AND n.max_duration_minutes IS NOT NULL;
