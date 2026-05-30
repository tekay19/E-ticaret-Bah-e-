CREATE TABLE inventory (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  variant_id UUID UNIQUE NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  on_hand INT NOT NULL DEFAULT 0,
  reserved INT NOT NULL DEFAULT 0,
  available INT GENERATED ALWAYS AS (on_hand - reserved) STORED,
  unit_type TEXT NOT NULL DEFAULT 'piece' CHECK (unit_type IN ('piece', 'kg', 'liter', 'meter', 'bag', 'pack')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT inventory_non_negative CHECK (on_hand >= 0 AND reserved >= 0 AND reserved <= on_hand)
);

CREATE INDEX idx_inventory_available ON inventory(available);

CREATE TABLE inventory_movements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  variant_id UUID NOT NULL REFERENCES product_variants(id),
  movement_type TEXT NOT NULL CHECK (movement_type IN (
    'purchase', 'sale', 'return', 'adjustment', 'waste', 'transfer_in', 'transfer_out'
  )),
  quantity INT NOT NULL,
  reference_type TEXT,
  reference_id UUID,
  reason TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_movements_variant ON inventory_movements(variant_id, created_at DESC);

CREATE TABLE inventory_reservations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  variant_id UUID NOT NULL REFERENCES product_variants(id),
  quantity INT NOT NULL CHECK (quantity > 0),
  reservation_type TEXT NOT NULL CHECK (reservation_type IN ('cart', 'order')),
  reference_id TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  released_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_inventory_reservations_reference ON inventory_reservations(reference_id);
CREATE UNIQUE INDEX idx_inventory_reservations_reference_variant ON inventory_reservations(reference_id, variant_id);
CREATE INDEX idx_inventory_reservations_expired ON inventory_reservations(expires_at) WHERE released_at IS NULL;
