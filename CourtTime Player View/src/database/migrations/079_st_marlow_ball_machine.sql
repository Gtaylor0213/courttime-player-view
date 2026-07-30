-- St. Marlow Ball Machine: members buy a 1/3/6/12-month unlimited-use pass, or keep
-- paying the existing per-hour rate (courts.ball_machine_fee_cents, migration 064).
-- Either way, flagging the machine on a booking reveals the club's keypad code.
-- Gated behind the st_marlow_ball_machine feature flag (facility_features table).
--
-- Note: migration 007 seeded a dormant rules-engine config
-- ('{"sub_amenity_type": "ball_machine", "max_concurrent": 2, ...}') that nothing
-- evaluates. ball_machine_config.machine_count is the real concurrency limit.

-- Per-facility keypad code and how many physical machines the club owns.
CREATE TABLE IF NOT EXISTS ball_machine_config (
  facility_id   VARCHAR(50) PRIMARY KEY REFERENCES facilities(id) ON DELETE CASCADE,
  access_code   VARCHAR(32),
  machine_count INTEGER NOT NULL DEFAULT 1 CHECK (machine_count >= 1),
  instructions  TEXT,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by    UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Admin-priced pass durations; one row per length the club offers.
CREATE TABLE IF NOT EXISTS ball_machine_pass_products (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id     VARCHAR(50) NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  duration_months INTEGER NOT NULL CHECK (duration_months IN (1, 3, 6, 12)),
  price_cents     INTEGER NOT NULL CHECK (price_cents >= 0),
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_ball_machine_pass_duration UNIQUE (facility_id, duration_months)
);

CREATE INDEX IF NOT EXISTS idx_ball_machine_products_facility
  ON ball_machine_pass_products(facility_id);

-- A member's purchased (or admin-comped) pass. Rows start 'pending' and flip to
-- 'active' once Stripe confirms; comped passes are inserted 'active' with granted_by set.
CREATE TABLE IF NOT EXISTS ball_machine_passes (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id                VARCHAR(50) NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  user_id                    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  duration_months            INTEGER NOT NULL CHECK (duration_months > 0),
  price_cents_at_purchase    INTEGER NOT NULL CHECK (price_cents_at_purchase >= 0),
  starts_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at                 TIMESTAMPTZ NOT NULL,
  status                     VARCHAR(20) NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending', 'active', 'cancelled', 'refunded')),
  connect_payment_id         VARCHAR(64) REFERENCES connect_payments(id) ON DELETE SET NULL,
  stripe_checkout_session_id VARCHAR(255),
  stripe_payment_intent_id   VARCHAR(255),
  granted_by                 UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Drives the hot path: "does this member have a live pass at this club right now?"
CREATE INDEX IF NOT EXISTS idx_ball_machine_passes_lookup
  ON ball_machine_passes(facility_id, user_id, status, expires_at DESC);

CREATE INDEX IF NOT EXISTS idx_ball_machine_passes_session
  ON ball_machine_passes(stripe_checkout_session_id);

-- Pins the pass-vs-hourly decision at booking time so post-play settlement can't
-- re-charge a member whose pass already covered the session.
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS ball_machine_pass_id UUID
    REFERENCES ball_machine_passes(id) ON DELETE SET NULL;

-- Facility-wide overlap check for machine_count enforcement.
CREATE INDEX IF NOT EXISTS idx_bookings_ball_machine_claims
  ON bookings(facility_id, booking_date)
  WHERE add_ball_machine = true;

-- Pass purchases are their own revenue line, distinct from the hourly rental
-- (which is folded into COURT_BOOKING).
ALTER TABLE facility_revenue_log
  DROP CONSTRAINT IF EXISTS facility_revenue_log_payment_type_check;

ALTER TABLE facility_revenue_log
  ADD CONSTRAINT facility_revenue_log_payment_type_check
    CHECK (payment_type IN (
      'COURT_BOOKING', 'BULLETIN_SIGNUP', 'PAYMENT_ITEM',
      'GUEST_FEE', 'PLATFORM_SUBSCRIPTION', 'BALL_MACHINE_PASS'
    ));

-- Match 070_enable_rls.sql: backend connects as postgres (BYPASSRLS); enabling
-- RLS with no policies closes the unused PostgREST surface.
ALTER TABLE IF EXISTS public.ball_machine_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.ball_machine_pass_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.ball_machine_passes ENABLE ROW LEVEL SECURITY;
