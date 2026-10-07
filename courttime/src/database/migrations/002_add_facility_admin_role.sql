-- Migration: Add facility admin role support
-- This allows facility memberships to designate admins

-- Add is_facility_admin column to facility_memberships
ALTER TABLE facility_memberships
ADD COLUMN IF NOT EXISTS is_facility_admin BOOLEAN DEFAULT false;

-- Create index for faster admin lookups
CREATE INDEX IF NOT EXISTS idx_facility_memberships_admin ON facility_memberships(facility_id, is_facility_admin) WHERE is_facility_admin = true;

-- Add comment
COMMENT ON COLUMN facility_memberships.is_facility_admin IS 'Indicates if the member has admin privileges for this specific facility';
