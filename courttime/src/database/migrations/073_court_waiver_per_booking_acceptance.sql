-- Migration: Court waivers must be accepted every time the court is booked,
-- not once per published version (unlike the facility Terms & Conditions).
-- Acceptances become an append-only log — one row per acceptance event — and
-- the booking blocker checks for a recent acceptance instead of any acceptance.

-- Drop the once-per-version uniqueness so repeat acceptances can be recorded.
DO $$
DECLARE
    v_conname text;
BEGIN
    SELECT c.conname INTO v_conname
    FROM pg_constraint c
    WHERE c.conrelid = 'public.member_court_waiver_acceptances'::regclass
      AND c.contype = 'u';
    IF v_conname IS NOT NULL THEN
        EXECUTE format(
            'ALTER TABLE public.member_court_waiver_acceptances DROP CONSTRAINT %I',
            v_conname
        );
    END IF;
END $$;

-- The booking blocker looks up "accepted this version within the last N minutes".
CREATE INDEX IF NOT EXISTS idx_member_court_waiver_acceptances_recency
    ON member_court_waiver_acceptances (user_id, court_id, version_number, accepted_at DESC);
