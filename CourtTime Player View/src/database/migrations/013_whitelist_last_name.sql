-- Migration 013: Add last_name to address_whitelist for household-level auto-approval

-- Add last_name column (empty string default so existing rows remain valid)
ALTER TABLE address_whitelist ADD COLUMN IF NOT EXISTS last_name VARCHAR(100) DEFAULT '';

-- Drop old unique constraint on (facility_id, address)
ALTER TABLE address_whitelist DROP CONSTRAINT IF EXISTS address_whitelist_facility_id_address_key;

-- Create new unique index on (facility_id, normalized street, normalized last_name)
-- This allows the same address with different last names (e.g., roommates)
CREATE UNIQUE INDEX IF NOT EXISTS idx_whitelist_facility_address_lastname
  ON address_whitelist (facility_id, LOWER(TRIM(SPLIT_PART(address, ',', 1))), LOWER(TRIM(last_name)));
