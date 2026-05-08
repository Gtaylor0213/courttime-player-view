-- Migration 030: Keep only core booking rules requested by product
-- Enforced set:
--   ACC-002, ACC-005, CRT-005, ACC-010, CRT-001, CRT-002, HH-003

DELETE FROM facility_rule_configs frc
USING booking_rule_definitions brd
WHERE frc.rule_definition_id = brd.id
  AND brd.rule_code NOT IN (
    'ACC-002',
    'ACC-005',
    'CRT-005',
    'ACC-010',
    'CRT-001',
    'CRT-002',
    'HH-003'
  );
