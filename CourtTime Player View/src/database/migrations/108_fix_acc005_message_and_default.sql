-- Migration 108: Fix ACC-005 (days in advance) failure message and default config
--
-- The old template said "Earliest available: {earliestAllowedDate}" but that value was the
-- LAST bookable date, so blocked players were told the opposite of the truth. The engine now
-- builds this message itself (shared/utils/bookingWindow.ts); the template mirrors that wording
-- using placeholders the evaluator supplies.
--
-- default_config used max_days_ahead = 3 plus an open_time_local key no evaluator reads, which
-- the mobile admin screen showed as an editable field and "Enable all" applied as a 3-day cap.
-- Align it with the admin UI default (14) and drop the dead key.

UPDATE booking_rule_definitions
SET failure_message_template =
      'You can book up to {maxDaysAhead} days in advance (today counts as day 1). The latest date you can book right now is {lastBookableLabel}.',
    default_config = '{"max_days_ahead": 14}'::jsonb,
    config_schema = '{"type":"object","properties":{"max_days_ahead":{"type":"integer"}}}'::jsonb
WHERE rule_code = 'ACC-005';

UPDATE facility_rule_configs frc
SET rule_config = frc.rule_config - 'open_time_local'
FROM booking_rule_definitions brd
WHERE brd.id = frc.rule_definition_id
  AND brd.rule_code = 'ACC-005'
  AND frc.rule_config ? 'open_time_local';
