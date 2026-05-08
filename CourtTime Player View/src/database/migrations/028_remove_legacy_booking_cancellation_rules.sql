-- Migration 028: Remove legacy booking/cancellation rules that are no longer supported
-- Removes both rule definitions and any per-facility configurations for:
--   ACC-006 (Minimum Lead Time)
--   ACC-008 (Late Cancellation Policy)
--   CRT-012 (Court-Specific Cancellation Deadline)

DELETE FROM facility_rule_configs
WHERE rule_definition_id IN (
  SELECT id
  FROM booking_rule_definitions
  WHERE rule_code IN ('ACC-006', 'ACC-008', 'CRT-012')
);

DELETE FROM booking_rule_definitions
WHERE rule_code IN ('ACC-006', 'ACC-008', 'CRT-012');
