CREATE TABLE carrier_rates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  carrier_code TEXT NOT NULL CHECK (carrier_code IN ('aras', 'mng', 'yurtici', 'ptt')),
  min_desi NUMERIC(5,2) NOT NULL,
  max_desi NUMERIC(5,2) NOT NULL,
  price_cents BIGINT NOT NULL CHECK (price_cents >= 0),
  valid_from DATE NOT NULL,
  valid_to DATE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX idx_carrier_rates_active ON carrier_rates(carrier_code, min_desi, max_desi)
  WHERE is_active = TRUE;

INSERT INTO carrier_rates (carrier_code, min_desi, max_desi, price_cents, valid_from)
VALUES
  ('aras', 0, 2, 5990, CURRENT_DATE),
  ('aras', 2.01, 5, 7990, CURRENT_DATE),
  ('aras', 5.01, 10, 11990, CURRENT_DATE),
  ('mng', 0, 2, 6490, CURRENT_DATE),
  ('mng', 2.01, 5, 8490, CURRENT_DATE),
  ('mng', 5.01, 10, 12490, CURRENT_DATE),
  ('yurtici', 0, 2, 6990, CURRENT_DATE),
  ('yurtici', 2.01, 5, 8990, CURRENT_DATE),
  ('yurtici', 5.01, 10, 12990, CURRENT_DATE),
  ('ptt', 0, 2, 4990, CURRENT_DATE),
  ('ptt', 2.01, 5, 6990, CURRENT_DATE),
  ('ptt', 5.01, 10, 9990, CURRENT_DATE);
