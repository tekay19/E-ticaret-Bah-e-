CREATE TABLE brands (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  logo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  parent_id UUID REFERENCES categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  meta_title TEXT,
  meta_description TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE category_closure (
  ancestor_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  descendant_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  depth INT NOT NULL,
  PRIMARY KEY (ancestor_id, descendant_id)
);

CREATE INDEX idx_closure_descendant ON category_closure(descendant_id);

CREATE OR REPLACE FUNCTION update_category_closure() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO category_closure(ancestor_id, descendant_id, depth)
  VALUES (NEW.id, NEW.id, 0);

  IF NEW.parent_id IS NOT NULL THEN
    INSERT INTO category_closure(ancestor_id, descendant_id, depth)
    SELECT ancestor_id, NEW.id, depth + 1
    FROM category_closure
    WHERE descendant_id = NEW.parent_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER categories_closure_insert
  AFTER INSERT ON categories
  FOR EACH ROW EXECUTE FUNCTION update_category_closure();

CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sku TEXT UNIQUE NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  short_description TEXT,
  brand_id UUID REFERENCES brands(id),
  category_id UUID NOT NULL REFERENCES categories(id),
  weight_kg NUMERIC(10,3),
  volume_desi NUMERIC(10,2),
  dimensions_lwh JSONB,
  material TEXT,
  usage_area TEXT[],
  season_tags TEXT[],
  is_hazardous BOOLEAN NOT NULL DEFAULT FALSE,
  msds_pdf_url TEXT,
  warranty_months INT,
  is_returnable BOOLEAN NOT NULL DEFAULT TRUE,
  return_rules JSONB,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  min_stock_alert INT NOT NULL DEFAULT 5,
  meta_title TEXT,
  meta_description TEXT,
  search_vector TSVECTOR,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_products_search ON products USING GIN(search_vector);
CREATE INDEX idx_products_category ON products(category_id) WHERE is_active = TRUE;
CREATE INDEX idx_products_brand ON products(brand_id) WHERE is_active = TRUE;

CREATE TABLE product_variants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku TEXT UNIQUE NOT NULL,
  options JSONB NOT NULL,
  price_cents BIGINT NOT NULL CHECK (price_cents >= 0),
  compare_at_price_cents BIGINT CHECK (compare_at_price_cents IS NULL OR compare_at_price_cents >= 0),
  cost_cents BIGINT CHECK (cost_cents IS NULL OR cost_cents >= 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_product_variants_product ON product_variants(product_id);

CREATE TABLE product_images (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  thumbnail_url TEXT,
  webp_url TEXT,
  alt_text TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_product_images_product ON product_images(product_id);

CREATE OR REPLACE FUNCTION products_search_trigger() RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('simple', unaccent(coalesce(NEW.name, ''))), 'A') ||
    setweight(to_tsvector('simple', unaccent(coalesce(NEW.short_description, ''))), 'B') ||
    setweight(to_tsvector('simple', unaccent(coalesce(NEW.description, ''))), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER products_search_update
  BEFORE INSERT OR UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION products_search_trigger();
