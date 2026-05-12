-- Migration 035: remove obsolete ACC-011 rate-limit booking rule

DELETE FROM facility_rule_configs frc
USING booking_rule_definitions brd
WHERE frc.rule_definition_id = brd.id
  AND brd.rule_code = 'ACC-011';

DELETE FROM booking_rule_definitions
WHERE rule_code = 'ACC-011';

DROP FUNCTION IF EXISTS cleanup_old_rate_limits();
DROP TABLE IF EXISTS booking_rate_limits;
