-- Split payment share lifecycle: explicit decline + response tracking.
-- Previously a participant could only ever silently ignore an invitation;
-- 'declined' lets them actively refuse, which immediately unwinds the hold.
ALTER TABLE booking_payment_shares
  DROP CONSTRAINT IF EXISTS booking_payment_shares_status_check;
ALTER TABLE booking_payment_shares
  ADD CONSTRAINT booking_payment_shares_status_check
  CHECK (status IN ('pending', 'paid', 'failed', 'cancelled', 'refunded', 'declined'));

ALTER TABLE booking_payment_shares
  ADD COLUMN IF NOT EXISTS responded_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS decline_reason VARCHAR(500);
