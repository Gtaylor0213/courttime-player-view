-- Allow refunded status on non-checkout Connect charge tables.

ALTER TABLE booking_settlement_charges
  DROP CONSTRAINT IF EXISTS booking_settlement_charges_status_check;
ALTER TABLE booking_settlement_charges
  ADD CONSTRAINT booking_settlement_charges_status_check
  CHECK (status IN ('pending', 'charged', 'failed', 'cash', 'waived', 'refunded'));

ALTER TABLE annual_fee_billing_records
  DROP CONSTRAINT IF EXISTS annual_fee_billing_records_status_check;
ALTER TABLE annual_fee_billing_records
  ADD CONSTRAINT annual_fee_billing_records_status_check
  CHECK (status IN ('charged', 'lockout_applied', 'failed', 'waived', 'refunded'));

ALTER TABLE pro_shop_orders
  DROP CONSTRAINT IF EXISTS pro_shop_orders_status_check;
ALTER TABLE pro_shop_orders
  ADD CONSTRAINT pro_shop_orders_status_check
  CHECK (status IN ('pending', 'paid', 'cancelled', 'refunded'));
