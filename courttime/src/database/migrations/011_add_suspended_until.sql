-- Add suspended_until column to facility_memberships for timed suspensions
ALTER TABLE facility_memberships
  ADD COLUMN IF NOT EXISTS suspended_until TIMESTAMP;
