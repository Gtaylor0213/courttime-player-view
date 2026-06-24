-- Guest sales: allow pro shop orders without a CourtTime user account.
-- Admins record walk-in guest purchases with a name and optional email.

ALTER TABLE pro_shop_orders
  ALTER COLUMN user_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS guest_name  VARCHAR(200),
  ADD COLUMN IF NOT EXISTS guest_email VARCHAR(200);

-- Constraint: every order must have either a user_id or a guest_name
ALTER TABLE pro_shop_orders
  ADD CONSTRAINT pro_shop_orders_buyer_check
    CHECK (user_id IS NOT NULL OR guest_name IS NOT NULL);

-- Drop the existing index that assumed user_id is always present and recreate as partial
DROP INDEX IF EXISTS idx_pro_shop_orders_user;
CREATE INDEX idx_pro_shop_orders_user ON pro_shop_orders(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_pro_shop_orders_guest ON pro_shop_orders(facility_id, guest_name) WHERE guest_name IS NOT NULL;
