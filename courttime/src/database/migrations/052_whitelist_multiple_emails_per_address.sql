-- Migration 052: Allow multiple whitelist rows per address+last name when emails differ.
-- Imports often list one row per invite (same household, different email).

DROP INDEX IF EXISTS idx_whitelist_facility_address_lastname;

-- Household-level uniqueness only when no email is set on the row.
CREATE UNIQUE INDEX IF NOT EXISTS idx_whitelist_facility_address_lastname_no_email
  ON address_whitelist (
    facility_id,
    LOWER(TRIM(SPLIT_PART(address, ',', 1))),
    LOWER(TRIM(last_name))
  )
  WHERE email IS NULL OR TRIM(email) = '';
