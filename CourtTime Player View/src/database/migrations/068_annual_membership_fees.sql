-- Annual Membership Fees: per-facility fee tiers, billing config, and audit log.
-- Gated behind the annual_membership_fees feature flag.

-- Admin-defined fee tier catalog (e.g. "Full Member: $500/yr", "Social: $200/yr")
CREATE TABLE IF NOT EXISTS annual_fee_tiers (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id VARCHAR(50) NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  name        VARCHAR(100) NOT NULL,
  amount_cents INTEGER     NOT NULL CHECK (amount_cents >= 0),
  description TEXT,
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_annual_fee_tiers_facility ON annual_fee_tiers(facility_id);

-- Billing date configuration per facility
CREATE TABLE IF NOT EXISTS annual_fee_config (
  facility_id   VARCHAR(50) PRIMARY KEY REFERENCES facilities(id) ON DELETE CASCADE,
  billing_month INTEGER     NOT NULL CHECK (billing_month BETWEEN 1 AND 12),
  billing_day   INTEGER     NOT NULL CHECK (billing_day BETWEEN 1 AND 28),
  is_active     BOOLEAN     NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Track which tier each member is assigned to
ALTER TABLE facility_memberships
  ADD COLUMN IF NOT EXISTS annual_fee_tier_id UUID REFERENCES annual_fee_tiers(id) ON DELETE SET NULL;

-- Billing run audit log (one row per admin-triggered run)
CREATE TABLE IF NOT EXISTS annual_fee_billing_runs (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id    VARCHAR(50) NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  billing_year   INTEGER     NOT NULL,
  total_members  INTEGER     NOT NULL DEFAULT 0,
  charged_count  INTEGER     NOT NULL DEFAULT 0,
  lockout_count  INTEGER     NOT NULL DEFAULT 0,
  failed_count   INTEGER     NOT NULL DEFAULT 0,
  waived_count   INTEGER     NOT NULL DEFAULT 0,
  triggered_by   UUID        REFERENCES users(id) ON DELETE SET NULL,
  started_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_annual_fee_runs_facility ON annual_fee_billing_runs(facility_id);

-- Per-member result within a billing run
CREATE TABLE IF NOT EXISTS annual_fee_billing_records (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id                   UUID        NOT NULL REFERENCES annual_fee_billing_runs(id) ON DELETE CASCADE,
  facility_id              VARCHAR(50) NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  user_id                  UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tier_id                  UUID        REFERENCES annual_fee_tiers(id) ON DELETE SET NULL,
  tier_name                VARCHAR(100),
  amount_cents             INTEGER     NOT NULL,
  billing_year             INTEGER     NOT NULL,
  status                   VARCHAR(20) NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('charged', 'lockout_applied', 'failed', 'waived')),
  stripe_payment_intent_id VARCHAR(255),
  error_message            TEXT,
  processed_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_annual_fee_records_run      ON annual_fee_billing_records(run_id);
CREATE INDEX IF NOT EXISTS idx_annual_fee_records_facility ON annual_fee_billing_records(facility_id);
CREATE INDEX IF NOT EXISTS idx_annual_fee_records_user     ON annual_fee_billing_records(user_id);
