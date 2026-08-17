-- Migration: Add sub-admin role support
-- Sub-admins are exempt from player booking rules (like facility admins) but have
-- no other admin access (no admin-panel/API permissions) — unlike facility_admins/is_facility_admin.

ALTER TABLE facility_memberships
ADD COLUMN IF NOT EXISTS is_sub_admin BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_facility_memberships_sub_admin ON facility_memberships(facility_id, is_sub_admin) WHERE is_sub_admin = true;

COMMENT ON COLUMN facility_memberships.is_sub_admin IS 'Exempts the member from booking rules (like an admin), without granting any other admin privileges';
