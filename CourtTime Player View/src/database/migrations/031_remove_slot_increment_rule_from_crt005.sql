-- Migration 031: Remove slot-increment enforcement from CRT-005
-- CRT-005 now represents max reservation duration only.

UPDATE booking_rule_definitions
SET
  rule_name = 'Max Reservation Duration',
  description = 'Limits the maximum booking duration for a single reservation.',
  config_schema = '{"type":"object","properties":{"max_duration_minutes":{"type":"integer"}}}',
  default_config = '{"max_duration_minutes":120}',
  failure_message_template = 'Maximum reservation duration is {maxDuration} minutes.'
WHERE rule_code = 'CRT-005';
