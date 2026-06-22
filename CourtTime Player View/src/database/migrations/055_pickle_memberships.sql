-- Migration 055: CourtTime-Pickle membership catalog + hybrid entitlements (Phase 2)
-- Additive only. Classic facilities unchanged.

CREATE TABLE IF NOT EXISTS org_membership_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id VARCHAR(64) NOT NULL REFERENCES franchise_organizations(id) ON DELETE CASCADE,
  national_sku VARCHAR(64) NOT NULL,
  tier VARCHAR(20) NOT NULL
    CHECK (tier IN ('trial', 'unlimited', 'play', 'pro')),
  name VARCHAR(255) NOT NULL,
  price_cents INTEGER NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
  duration_days INTEGER CHECK (duration_days IS NULL OR duration_days > 0),
  entitlements JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, national_sku)
);

CREATE INDEX IF NOT EXISTS idx_org_membership_products_org ON org_membership_products(org_id);
CREATE INDEX IF NOT EXISTS idx_org_membership_products_tier ON org_membership_products(tier);
CREATE INDEX IF NOT EXISTS idx_org_membership_products_active ON org_membership_products(org_id, is_active)
  WHERE is_active = true;

CREATE TABLE IF NOT EXISTS member_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id VARCHAR(64) NOT NULL REFERENCES franchise_organizations(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES org_membership_products(id) ON DELETE RESTRICT,
  home_facility_id VARCHAR(50) NOT NULL REFERENCES facilities(id) ON DELETE RESTRICT,
  status VARCHAR(30) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'trialing', 'past_due', 'canceled', 'expired')),
  stripe_subscription_id VARCHAR(255),
  trial_ends_at TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_member_subscriptions_user ON member_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_member_subscriptions_org ON member_subscriptions(org_id);
CREATE INDEX IF NOT EXISTS idx_member_subscriptions_user_org ON member_subscriptions(user_id, org_id);
CREATE INDEX IF NOT EXISTS idx_member_subscriptions_status ON member_subscriptions(status)
  WHERE status IN ('active', 'trialing');

CREATE TABLE IF NOT EXISTS member_entitlement_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES member_subscriptions(id) ON DELETE CASCADE,
  perk_type VARCHAR(50) NOT NULL
    CHECK (perk_type IN ('clinic', 'guest_pass', 'ball_machine', 'paddle_fitting')),
  period_month VARCHAR(7) NOT NULL,
  used_count INTEGER NOT NULL DEFAULT 0 CHECK (used_count >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (subscription_id, perk_type, period_month)
);

CREATE INDEX IF NOT EXISTS idx_member_entitlement_ledger_subscription
  ON member_entitlement_ledger(subscription_id, period_month);

CREATE TABLE IF NOT EXISTS org_product_rollouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id VARCHAR(64) NOT NULL REFERENCES franchise_organizations(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES org_membership_products(id) ON DELETE CASCADE,
  facility_id VARCHAR(50) NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, product_id, facility_id)
);

CREATE INDEX IF NOT EXISTS idx_org_product_rollouts_org ON org_product_rollouts(org_id);
CREATE INDEX IF NOT EXISTS idx_org_product_rollouts_facility ON org_product_rollouts(facility_id);
CREATE INDEX IF NOT EXISTS idx_org_product_rollouts_product ON org_product_rollouts(product_id);

COMMENT ON TABLE org_membership_products IS 'Corporate membership catalog with national SKU and tier entitlements JSON';
COMMENT ON TABLE member_subscriptions IS 'Player org-level subscription with home facility for location-scoped perks';
COMMENT ON TABLE member_entitlement_ledger IS 'Monthly counters for home-facility perks (clinics, guest passes, etc.)';
COMMENT ON TABLE org_product_rollouts IS 'Which membership products are enabled at each franchise location';

-- Default tier entitlements (seed via seed_pickle_membership_products(org_id) or manual INSERT):
--
-- TRIAL-001   | trial     | $30   | 15 days | Unlimited-tier brand-wide access during trial
-- UNLIMITED-001 | unlimited | $99/mo | 30 days | brand: courts, open play, socials, leagues, tournaments
--                                           | home: 4 clinics/mo, 4 guest passes/mo
-- PLAY-001    | play      | $49/mo | 30 days | brand: open play, socials; 50% off courts/leagues/tournaments
--                                           | home: 1 clinic/mo
-- PRO-001     | pro       | $149/mo | 30 days | brand: same as unlimited
--                                           | home: unlimited perks + ball machine, Wingfield AI,
--                                             $100 renewal credit, 1 paddle fitting/yr

CREATE OR REPLACE FUNCTION seed_pickle_membership_products(p_org_id VARCHAR(64))
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO org_membership_products (org_id, national_sku, tier, name, price_cents, duration_days, entitlements)
  VALUES
    (
      p_org_id, 'TRIAL-001', 'trial', 'Trial Membership', 3000, 15,
      '{"brandWide":{"courtBooking":true,"openPlay":true,"socials":true,"leagues":true,"tournaments":true,"courtDiscountPercent":0},"homeFacility":{"clinicsPerMonth":4,"guestPassesPerMonth":4,"ballMachine":false,"wingfieldAi":false,"paddleFittingPerYear":0,"renewalCreditCents":0},"dropInPriceCents":1500}'::jsonb
    ),
    (
      p_org_id, 'UNLIMITED-001', 'unlimited', 'Unlimited Membership', 9900, 30,
      '{"brandWide":{"courtBooking":true,"openPlay":true,"socials":true,"leagues":true,"tournaments":true,"courtDiscountPercent":0},"homeFacility":{"clinicsPerMonth":4,"guestPassesPerMonth":4,"ballMachine":false,"wingfieldAi":false,"paddleFittingPerYear":0,"renewalCreditCents":0},"dropInPriceCents":0}'::jsonb
    ),
    (
      p_org_id, 'PLAY-001', 'play', 'Play Membership', 4900, 30,
      '{"brandWide":{"courtBooking":true,"openPlay":true,"socials":true,"leagues":true,"tournaments":true,"courtDiscountPercent":50},"homeFacility":{"clinicsPerMonth":1,"guestPassesPerMonth":0,"ballMachine":false,"wingfieldAi":false,"paddleFittingPerYear":0,"renewalCreditCents":0},"dropInPriceCents":1500}'::jsonb
    ),
    (
      p_org_id, 'PRO-001', 'pro', 'Pro Membership', 14900, 30,
      '{"brandWide":{"courtBooking":true,"openPlay":true,"socials":true,"leagues":true,"tournaments":true,"courtDiscountPercent":0},"homeFacility":{"clinicsPerMonth":4,"guestPassesPerMonth":4,"ballMachine":true,"wingfieldAi":true,"paddleFittingPerYear":1,"renewalCreditCents":10000},"dropInPriceCents":0}'::jsonb
    )
  ON CONFLICT (org_id, national_sku) DO NOTHING;
END;
$$;

COMMENT ON FUNCTION seed_pickle_membership_products IS 'Seeds default Trial/Unlimited/Play/Pro catalog for a pickle org';
