-- Migration 043: Add view-only member flag to facility_memberships
-- View-only members can see the court calendar but cannot make bookings.

ALTER TABLE facility_memberships
  ADD COLUMN IF NOT EXISTS is_view_only BOOLEAN NOT NULL DEFAULT FALSE;
