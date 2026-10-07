-- Pro Shop: tab billing, settings, and admin-assigned charges

CREATE TABLE IF NOT EXISTS pro_shop_settings (
  facility_id        VARCHAR(50) PRIMARY KEY REFERENCES facilities(id) ON DELETE CASCADE,
  tab_billing_day    INTEGER NOT NULL DEFAULT 1 CHECK (tab_billing_day BETWEEN 1 AND 28),
  require_card       BOOLEAN NOT NULL DEFAULT false,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pro_shop_tabs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id  VARCHAR(50) NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(facility_id, user_id)
);

CREATE TABLE IF NOT EXISTS pro_shop_tab_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tab_id           UUID NOT NULL REFERENCES pro_shop_tabs(id) ON DELETE CASCADE,
  product_id       UUID NOT NULL REFERENCES pro_shop_products(id) ON DELETE RESTRICT,
  product_name     VARCHAR(200) NOT NULL,
  quantity         INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  price_cents      INTEGER NOT NULL CHECK (price_cents >= 0),
  assigned_by      UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  assigned_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  billed_at        TIMESTAMPTZ,
  billing_order_id UUID REFERENCES pro_shop_orders(id) ON DELETE SET NULL
);

-- Add payment intent ID for admin-initiated charges (direct charges and tab billing)
ALTER TABLE pro_shop_orders
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT,
  ADD COLUMN IF NOT EXISTS charged_by UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pro_shop_tabs_facility   ON pro_shop_tabs(facility_id);
CREATE INDEX IF NOT EXISTS idx_pro_shop_tab_items_tab   ON pro_shop_tab_items(tab_id);
CREATE INDEX IF NOT EXISTS idx_pro_shop_tab_items_unbilled
  ON pro_shop_tab_items(tab_id) WHERE billed_at IS NULL;
