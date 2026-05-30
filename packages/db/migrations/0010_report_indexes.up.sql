CREATE INDEX idx_orders_reporting_created ON orders(created_at DESC);
CREATE INDEX idx_orders_reporting_status_created ON orders(status, created_at DESC);
CREATE INDEX idx_payments_reporting_status_created ON payments(status, created_at DESC);
CREATE INDEX idx_refunds_reporting_status_created ON refunds(status, created_at DESC);
CREATE INDEX idx_coupon_redemptions_reporting_coupon ON coupon_redemptions(coupon_id, redeemed_at DESC);
