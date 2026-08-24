-- Padel drop-in: club-wide per-player fee to join a Social Play session.
-- Null = free / members-only (today's behavior). Setting a price is what
-- makes a club's padel drop-in "open to the public" -- see padelSocialService,
-- which relaxes the join-membership check from active-only to active-or-pending
-- only when this is set.
ALTER TABLE facilities
  ADD COLUMN IF NOT EXISTS padel_dropin_rate_cents INTEGER
    CHECK (padel_dropin_rate_cents IS NULL OR padel_dropin_rate_cents > 0);

COMMENT ON COLUMN facilities.padel_dropin_rate_cents IS 'Per-player fee (cents) to join a Padel Social Play session. Null = free/members-only.';
