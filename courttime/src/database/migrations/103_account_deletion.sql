-- Account deletion (Apple Guideline 5.1.1(v) / Google Play equivalent).
--
-- Accounts are anonymized in place rather than deleted as rows. Two reasons:
--
--   1. legal/ACCOUNT_DELETION.md promises facilities keep anonymized booking
--      history and that financial records are retained for 7 years. A row
--      delete would cascade bookings away.
--   2. pro_shop_orders, pro_shop_tabs and pro_shop_tab_items reference
--      users(id) ON DELETE RESTRICT, so a row delete would fail outright for
--      any member who has ever bought something.
--
-- deleted_at marks the account closed: auth refuses it, and the member can
-- sign up again with the same address because the old row's email is
-- rewritten to a non-routable placeholder.

ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;

COMMENT ON COLUMN users.deleted_at IS
  'When the member deleted their account. Non-null means the row is an anonymized tombstone: it retains only what facility statistics and financial records need. Auth must reject these.';

-- Login and lookups filter on this constantly; partial index keeps the common
-- (live account) path cheap.
CREATE INDEX IF NOT EXISTS idx_users_active
  ON users (email)
  WHERE deleted_at IS NULL;
