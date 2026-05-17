-- Migration 048: Remove per-court slot duration (booking grid uses a fixed 30-minute increment)

ALTER TABLE court_operating_config
  DROP COLUMN IF EXISTS slot_duration;
