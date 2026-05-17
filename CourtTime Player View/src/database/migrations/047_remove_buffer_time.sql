-- Migration 047: Remove buffer time between reservations (back-to-back bookings allowed)

DELETE FROM facility_rule_configs frc
USING booking_rule_definitions brd
WHERE frc.rule_definition_id = brd.id
  AND brd.rule_code = 'CRT-007';

DELETE FROM booking_rule_definitions
WHERE rule_code = 'CRT-007';

ALTER TABLE court_operating_config
  DROP COLUMN IF EXISTS buffer_before,
  DROP COLUMN IF EXISTS buffer_after;
