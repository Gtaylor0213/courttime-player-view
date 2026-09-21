-- Pro shop sales now take CourtTime's platform fee (the facility's
-- platform_fee_percent, as a Stripe Connect application fee) like every other
-- member->club charge. Store the fee on the order, as connect_payments does, so
-- club revenue (net of the fee) and CourtTime's share stay exact even if the
-- facility's percent changes later. Orders before this carried no fee: 0.

ALTER TABLE pro_shop_orders
  ADD COLUMN IF NOT EXISTS platform_fee_cents INTEGER NOT NULL DEFAULT 0;
