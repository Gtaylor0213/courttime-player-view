-- Padel drop-in payment tracking, extending the existing roster table rather
-- than adding a parallel one -- a padel roster row's whole job is "joined +
-- (optionally) paid," unlike bookings where participation and payment are
-- separate concerns.
ALTER TABLE padel_social_players
  ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) NOT NULL DEFAULT 'not_required'
    CHECK (payment_status IN ('not_required', 'pending', 'paid', 'failed', 'refunded')),
  ADD COLUMN IF NOT EXISTS amount_cents INTEGER,
  ADD COLUMN IF NOT EXISTS connect_payment_id VARCHAR(64) REFERENCES connect_payments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payment_hold_expires_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_padel_social_players_payment_pending
  ON padel_social_players (payment_hold_expires_at) WHERE payment_status = 'pending';

COMMENT ON COLUMN padel_social_players.payment_status IS 'not_required = free session or joined before pricing existed. pending = roster slot held, awaiting Stripe Checkout completion.';
COMMENT ON COLUMN padel_social_players.payment_hold_expires_at IS 'Pending join is released back to the pool if unpaid past this time (see sweepPadelDropIns).';

-- Padel drop-in fees get their own revenue line, same precedent as
-- 079_st_marlow_ball_machine.sql splitting out BALL_MACHINE_PASS.
ALTER TABLE facility_revenue_log
  DROP CONSTRAINT IF EXISTS facility_revenue_log_payment_type_check;

ALTER TABLE facility_revenue_log
  ADD CONSTRAINT facility_revenue_log_payment_type_check
    CHECK (payment_type IN (
      'COURT_BOOKING', 'BULLETIN_SIGNUP', 'PAYMENT_ITEM',
      'GUEST_FEE', 'PLATFORM_SUBSCRIPTION', 'BALL_MACHINE_PASS', 'PADEL_DROP_IN'
    ));
