-- Migration 110: a blackout can cover a chosen set of courts
--
-- court_blackouts.court_id holds one court, or NULL for every court at the facility, so
-- closing courts 1-3 of 6 took three separate blackouts. court_ids holds the chosen set
-- when there is more than one. Which courts a blackout covers:
--   court_ids set   -> those courts
--   court_id set    -> that one court
--   both NULL       -> every court at the facility

ALTER TABLE court_blackouts ADD COLUMN IF NOT EXISTS court_ids UUID[];

CREATE INDEX IF NOT EXISTS idx_court_blackouts_court_ids ON court_blackouts USING GIN (court_ids) WHERE court_ids IS NOT NULL;

COMMENT ON COLUMN court_blackouts.court_id IS 'One court, or NULL when court_ids lists several or the blackout applies to all courts';
COMMENT ON COLUMN court_blackouts.court_ids IS 'Two or more chosen courts; NULL when court_id names one court or the blackout applies to all courts';
