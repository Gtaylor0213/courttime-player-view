-- Migration: Walk-up courts
-- Adds support for courts that are visible but not bookable online

ALTER TABLE courts
ADD COLUMN IF NOT EXISTS is_walk_up BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_courts_is_walk_up
ON courts (facility_id, is_walk_up);

COMMENT ON COLUMN courts.is_walk_up IS 'When true, court is walk-up only and cannot be booked online';
