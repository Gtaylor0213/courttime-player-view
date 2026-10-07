-- Pro Shop: per-facility inventory and member purchases.
-- Gated behind the pro_shop feature flag (facility_features table).

CREATE TABLE IF NOT EXISTS pro_shop_products (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id    VARCHAR(50) NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  name           VARCHAR(200) NOT NULL,
  description    TEXT,
  category       VARCHAR(50) NOT NULL CHECK (category IN ('clothing','rackets','balls','bags','footwear','accessories','other')),
  price_cents    INTEGER     NOT NULL CHECK (price_cents >= 0),
  stock_quantity INTEGER     CHECK (stock_quantity IS NULL OR stock_quantity >= 0),
  image_data     TEXT,
  is_active      BOOLEAN     NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pro_shop_orders (
  id                         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id                VARCHAR(50) NOT NULL REFERENCES facilities(id) ON DELETE RESTRICT,
  user_id                    UUID        NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  stripe_checkout_session_id TEXT,
  status                     VARCHAR(30) NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending', 'paid', 'cancelled')),
  total_cents                INTEGER     NOT NULL,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pro_shop_order_items (
  id                      UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id                UUID    NOT NULL REFERENCES pro_shop_orders(id) ON DELETE CASCADE,
  product_id              UUID    NOT NULL REFERENCES pro_shop_products(id) ON DELETE RESTRICT,
  quantity                INTEGER NOT NULL CHECK (quantity > 0),
  price_cents_at_purchase INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pro_shop_products_facility ON pro_shop_products(facility_id);
CREATE INDEX IF NOT EXISTS idx_pro_shop_orders_facility   ON pro_shop_orders(facility_id);
CREATE INDEX IF NOT EXISTS idx_pro_shop_orders_user       ON pro_shop_orders(user_id);
