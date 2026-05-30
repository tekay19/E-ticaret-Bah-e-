CREATE SEQUENCE return_number_seq START 1;

CREATE TABLE returns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  return_number TEXT UNIQUE NOT NULL DEFAULT (
    'RT-' || EXTRACT(YEAR FROM NOW())::TEXT || '-' || LPAD(nextval('return_number_seq')::TEXT, 6, '0')
  ),
  order_id UUID NOT NULL REFERENCES orders(id),
  customer_id UUID NOT NULL REFERENCES customers(id),
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN
    ('requested','approved','rejected','in_transit','received','refunded','cancelled')),
  reason TEXT NOT NULL CHECK (reason IN
    ('cayma_hakki','hasarli_kargo','yanlis_urun','defolu_urun','aciklamayla_uyumsuz')),
  customer_note TEXT,
  admin_note TEXT,
  photos JSONB,
  return_shipping_paid_by TEXT NOT NULL CHECK (return_shipping_paid_by IN ('customer','seller')),
  return_tracking_number TEXT,
  refund_amount_cents BIGINT,
  rejected_reason TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ
);

CREATE INDEX idx_returns_customer ON returns(customer_id, requested_at DESC);
CREATE INDEX idx_returns_order ON returns(order_id);
CREATE INDEX idx_returns_status ON returns(status, requested_at DESC);

CREATE TABLE return_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  return_id UUID NOT NULL REFERENCES returns(id) ON DELETE CASCADE,
  order_item_id UUID NOT NULL REFERENCES order_items(id),
  quantity INT NOT NULL CHECK (quantity > 0),
  unit_refund_cents BIGINT NOT NULL CHECK (unit_refund_cents >= 0),
  item_condition TEXT CHECK (item_condition IN ('unopened','opened','damaged','missing')),
  restock_eligible BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX idx_return_items_return ON return_items(return_id);
CREATE INDEX idx_return_items_order_item ON return_items(order_item_id);

CREATE TABLE return_status_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  return_id UUID NOT NULL REFERENCES returns(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  reason TEXT,
  changed_by UUID REFERENCES users(id),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_return_status_history_return ON return_status_history(return_id, changed_at DESC);

CREATE TABLE refunds (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  return_id UUID REFERENCES returns(id),
  order_id UUID NOT NULL REFERENCES orders(id),
  payment_id UUID NOT NULL REFERENCES payments(id),
  amount_cents BIGINT NOT NULL CHECK (amount_cents >= 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN
    ('pending','processing','succeeded','failed')),
  provider_refund_id TEXT,
  attempt_count INT NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_refunds_status ON refunds(status, created_at ASC);
CREATE INDEX idx_refunds_return ON refunds(return_id);
