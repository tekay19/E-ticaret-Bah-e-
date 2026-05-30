CREATE TABLE coupons (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percent', 'fixed')),
  discount_value INT NOT NULL CHECK (discount_value > 0),
  max_discount_cents BIGINT,
  min_subtotal_cents BIGINT NOT NULL DEFAULT 0,
  usage_limit INT,
  per_customer_limit INT,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_coupons_active_code ON coupons(code) WHERE is_active = TRUE;

CREATE TABLE coupon_redemptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  coupon_id UUID NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  discount_cents BIGINT NOT NULL CHECK (discount_cents >= 0),
  redeemed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (coupon_id, order_id)
);

CREATE INDEX idx_coupon_redemptions_coupon ON coupon_redemptions(coupon_id);
CREATE INDEX idx_coupon_redemptions_customer ON coupon_redemptions(customer_id, coupon_id);

INSERT INTO coupons (
  code, name, description, discount_type, discount_value, max_discount_cents,
  min_subtotal_cents, usage_limit, per_customer_limit, starts_at, is_active
) VALUES (
  'SPRINT9',
  'Sprint 9 test kuponu',
  'Smoke test ve gelistirme ortami icin yuzde indirim kuponu.',
  'percent',
  10,
  5000,
  1000,
  1000,
  3,
  NOW() - INTERVAL '1 day',
  TRUE
);
