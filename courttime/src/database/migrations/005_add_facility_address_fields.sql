-- Migration: Add separate address fields and logo_url to facilities table
-- This allows for more structured address storage and facility branding

-- Add new columns for structured address
ALTER TABLE facilities ADD COLUMN IF NOT EXISTS street_address TEXT;
ALTER TABLE facilities ADD COLUMN IF NOT EXISTS city VARCHAR(100);
ALTER TABLE facilities ADD COLUMN IF NOT EXISTS state VARCHAR(50);
ALTER TABLE facilities ADD COLUMN IF NOT EXISTS zip_code VARCHAR(20);
ALTER TABLE facilities ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- Migrate existing address data to street_address if not already populated
UPDATE facilities
SET street_address = address
WHERE street_address IS NULL AND address IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN facilities.street_address IS 'Street address of the facility';
COMMENT ON COLUMN facilities.city IS 'City where the facility is located';
COMMENT ON COLUMN facilities.state IS 'State/province where the facility is located';
COMMENT ON COLUMN facilities.zip_code IS 'Postal/ZIP code of the facility';
COMMENT ON COLUMN facilities.logo_url IS 'URL to the facility logo or image';
