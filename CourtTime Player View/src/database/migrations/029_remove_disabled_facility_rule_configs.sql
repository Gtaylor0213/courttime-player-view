-- Migration 029: Keep only actively enforced booking rules
-- Disabled rows are removed so facility_rule_configs contains enabled/enforced rules only.

DELETE FROM facility_rule_configs
WHERE is_enabled = false;
