-- Migration 050: Optional email on address whitelist with tokenized member setup invites

ALTER TABLE address_whitelist ADD COLUMN IF NOT EXISTS email VARCHAR(255);
ALTER TABLE address_whitelist ADD COLUMN IF NOT EXISTS setup_token VARCHAR(64);
ALTER TABLE address_whitelist ADD COLUMN IF NOT EXISTS setup_token_expires_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE address_whitelist ADD COLUMN IF NOT EXISTS setup_invite_sent_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE address_whitelist ADD COLUMN IF NOT EXISTS setup_invite_accepted_at TIMESTAMP WITH TIME ZONE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_whitelist_facility_email
  ON address_whitelist (facility_id, LOWER(TRIM(email)))
  WHERE email IS NOT NULL AND TRIM(email) <> '';

CREATE INDEX IF NOT EXISTS idx_address_whitelist_setup_token
  ON address_whitelist (setup_token)
  WHERE setup_token IS NOT NULL;
