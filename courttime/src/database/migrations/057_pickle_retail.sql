-- Migration 057: CourtTime-Pickle pro shop / retail (org SKU catalog, inventory, POS orders)
-- Additive only. Does not touch classic payment_items.

CREATE TABLE IF NOT EXISTS org_product_skus (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  national_sku VARCHAR(64) NOT NULL,
  org_id VARCHAR(64) NOT NULL REFERENCES franchise_organizations(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(30) NOT NULL CHECK (category IN (
    'paddle', 'shoe', 'ball', 'apparel', 'grab_and_go'
  )),
  brand VARCHAR(100),
  base_price_cents INTEGER NOT NULL CHECK (base_price_cents >= 0),
  status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(org_id, national_sku)
);

CREATE INDEX IF NOT EXISTS idx_org_product_skus_org
  ON org_product_skus(org_id);

CREATE INDEX IF NOT EXISTS idx_org_product_skus_category
  ON org_product_skus(org_id, category);

CREATE TABLE IF NOT EXISTS location_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku_id UUID NOT NULL REFERENCES org_product_skus(id) ON DELETE CASCADE,
  facility_id VARCHAR(50) NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  qty INTEGER CHECK (qty IS NULL OR qty >= 0),
  price_override_cents INTEGER CHECK (price_override_cents IS NULL OR price_override_cents >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(sku_id, facility_id)
);

CREATE INDEX IF NOT EXISTS idx_location_inventory_facility
  ON location_inventory(facility_id);

CREATE TABLE IF NOT EXISTS retail_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id VARCHAR(64) NOT NULL REFERENCES franchise_organizations(id) ON DELETE CASCADE,
  facility_id VARCHAR(50) NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  customer_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending', 'checkout_created', 'paid', 'fulfilled', 'cancelled', 'refunded'
    )),
  subtotal_cents INTEGER NOT NULL DEFAULT 0 CHECK (subtotal_cents >= 0),
  total_cents INTEGER NOT NULL DEFAULT 0 CHECK (total_cents >= 0),
  stripe_checkout_session_id VARCHAR(255),
  stripe_payment_intent_id VARCHAR(255),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_retail_orders_org
  ON retail_orders(org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_retail_orders_facility
  ON retail_orders(facility_id, created_at DESC);

CREATE TABLE IF NOT EXISTS retail_order_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES retail_orders(id) ON DELETE CASCADE,
  sku_id UUID NOT NULL REFERENCES org_product_skus(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
  line_total_cents INTEGER NOT NULL CHECK (line_total_cents >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_retail_order_lines_order
  ON retail_order_lines(order_id);

CREATE TABLE IF NOT EXISTS org_sku_rollouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id VARCHAR(64) NOT NULL REFERENCES franchise_organizations(id) ON DELETE CASCADE,
  sku_id UUID NOT NULL REFERENCES org_product_skus(id) ON DELETE CASCADE,
  facility_id VARCHAR(50) REFERENCES facilities(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'active', 'paused', 'ended')),
  effective_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_org_sku_rollouts_org
  ON org_sku_rollouts(org_id);

CREATE INDEX IF NOT EXISTS idx_org_sku_rollouts_sku
  ON org_sku_rollouts(sku_id);

COMMENT ON TABLE org_product_skus IS 'National / corporate SKU catalog for CourtTime-Pickle pro shops';
COMMENT ON TABLE location_inventory IS 'Per-location stock and optional price overrides for org SKUs';
COMMENT ON TABLE retail_orders IS 'POS / online retail orders (Stripe checkout stub in Phase 4)';
COMMENT ON TABLE org_sku_rollouts IS 'Corporate rollout schedule for SKUs to one or all franchise locations';
