-- Migration 024: Add secondary facility locations
-- Allows a facility to register additional physical campuses/branches
-- with a custom display name and full address.

CREATE TABLE IF NOT EXISTS facility_secondary_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  location_name VARCHAR(255) NOT NULL,          -- e.g. "North Campus", "Annex"
  street_address VARCHAR(255) NOT NULL,
  city VARCHAR(100) NOT NULL,
  state CHAR(2) NOT NULL,
  zip_code VARCHAR(10) NOT NULL,
  phone VARCHAR(20),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fsl_facility_id ON facility_secondary_locations(facility_id);
