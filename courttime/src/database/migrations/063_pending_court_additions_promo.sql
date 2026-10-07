-- Track promo codes applied to pending court addition payments
ALTER TABLE pending_court_additions
  ADD COLUMN IF NOT EXISTS promo_code_used VARCHAR(50);
