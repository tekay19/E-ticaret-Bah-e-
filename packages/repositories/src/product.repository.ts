import type { PoolClient } from "pg";
import { withTransaction } from "@bahce-shop/db";
import { BaseRepository } from "./base.repository.js";
import type {
  CartVariantRecord,
  ProductImageRecord,
  ProductRecord,
  ProductVariantRecord,
  ProductWithRelations,
} from "./types.js";

type ProductRow = {
  id: string;
  sku: string;
  slug: string;
  name: string;
  description: string | null;
  short_description: string | null;
  brand_id: string | null;
  category_id: string;
  weight_kg: string | null;
  volume_desi: string | null;
  dimensions_lwh: Record<string, unknown> | null;
  material: string | null;
  usage_area: string[] | null;
  season_tags: string[] | null;
  is_hazardous: boolean;
  msds_pdf_url: string | null;
  warranty_months: number | null;
  is_returnable: boolean;
  return_rules: Record<string, unknown> | null;
  is_active: boolean;
  min_stock_alert: number;
  meta_title: string | null;
  meta_description: string | null;
  created_at: Date;
  updated_at: Date;
};

type VariantRow = {
  id: string;
  product_id: string;
  sku: string;
  options: Record<string, unknown>;
  price_cents: string;
  compare_at_price_cents: string | null;
  cost_cents: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
};

type CartVariantRow = VariantRow & {
  product_name: string;
  product_slug: string;
  product_is_active: boolean;
  weight_kg: string | null;
  volume_desi: string | null;
  is_hazardous: boolean;
};

type ReturnableVariantRow = {
  variant_id: string;
  product_id: string;
  product_name: string;
  is_returnable: boolean;
  return_rules: Record<string, unknown> | null;
};

type ImageRow = {
  id: string;
  product_id: string;
  url: string;
  thumbnail_url: string | null;
  webp_url: string | null;
  alt_text: string | null;
  sort_order: number;
  created_at: Date;
};

export type CreateProductInput = {
  sku: string;
  slug: string;
  name: string;
  description?: string | null;
  shortDescription?: string | null;
  brandId?: string | null;
  categoryId: string;
  weightKg?: string | null;
  volumeDesi?: string | null;
  dimensionsLwh?: Record<string, unknown> | null;
  material?: string | null;
  usageArea?: string[] | null;
  seasonTags?: string[] | null;
  isHazardous?: boolean;
  msdsPdfUrl?: string | null;
  warrantyMonths?: number | null;
  isReturnable?: boolean;
  returnRules?: Record<string, unknown> | null;
  isActive?: boolean;
  minStockAlert?: number;
  metaTitle?: string | null;
  metaDescription?: string | null;
};

export type UpdateProductInput = Partial<Omit<CreateProductInput, "sku">>;

export type CreateVariantInput = {
  productId: string;
  sku: string;
  options: Record<string, unknown>;
  priceCents: number;
  compareAtPriceCents?: number | null;
  costCents?: number | null;
  isActive?: boolean;
};

export type CreateImageInput = {
  productId: string;
  url: string;
  thumbnailUrl?: string | null;
  webpUrl?: string | null;
  altText?: string | null;
  sortOrder?: number;
};

export type ProductListFilter = {
  q?: string;
  categoryId?: string;
  brandId?: string;
  isActive?: boolean | null;
  minPriceCents?: number;
  maxPriceCents?: number;
  sort?: "newest" | "price_asc" | "price_desc" | "name_asc";
  limit?: number;
  offset?: number;
};

export class ProductRepository extends BaseRepository<
  ProductRecord,
  CreateProductInput,
  UpdateProductInput,
  ProductRow
> {
  protected tableName = "products";

  protected mapRow(row: ProductRow): ProductRecord {
    return {
      id: row.id,
      sku: row.sku,
      slug: row.slug,
      name: row.name,
      description: row.description,
      shortDescription: row.short_description,
      brandId: row.brand_id,
      categoryId: row.category_id,
      weightKg: row.weight_kg,
      volumeDesi: row.volume_desi,
      dimensionsLwh: row.dimensions_lwh,
      material: row.material,
      usageArea: row.usage_area,
      seasonTags: row.season_tags,
      isHazardous: row.is_hazardous,
      msdsPdfUrl: row.msds_pdf_url,
      warrantyMonths: row.warranty_months,
      isReturnable: row.is_returnable,
      returnRules: row.return_rules,
      isActive: row.is_active,
      minStockAlert: row.min_stock_alert,
      metaTitle: row.meta_title,
      metaDescription: row.meta_description,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  private mapVariant(row: VariantRow): ProductVariantRecord {
    return {
      id: row.id,
      productId: row.product_id,
      sku: row.sku,
      options: row.options,
      priceCents: Number(row.price_cents),
      compareAtPriceCents: row.compare_at_price_cents ? Number(row.compare_at_price_cents) : null,
      costCents: row.cost_cents ? Number(row.cost_cents) : null,
      isActive: row.is_active,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  private mapCartVariant(row: CartVariantRow): CartVariantRecord {
    return {
      ...this.mapVariant(row),
      productName: row.product_name,
      productSlug: row.product_slug,
      productIsActive: row.product_is_active,
      weightKg: row.weight_kg,
      volumeDesi: row.volume_desi,
      isHazardous: row.is_hazardous,
    };
  }

  private mapImage(row: ImageRow): ProductImageRecord {
    return {
      id: row.id,
      productId: row.product_id,
      url: row.url,
      thumbnailUrl: row.thumbnail_url,
      webpUrl: row.webp_url,
      altText: row.alt_text,
      sortOrder: row.sort_order,
      createdAt: row.created_at.toISOString(),
    };
  }

  async create(input: CreateProductInput, client?: PoolClient): Promise<ProductRecord> {
    const result = await this.getExecutor(client).query<ProductRow>(
      `INSERT INTO products (
         sku, slug, name, description, short_description, brand_id, category_id,
         weight_kg, volume_desi, dimensions_lwh, material, usage_area, season_tags,
         is_hazardous, msds_pdf_url, warranty_months, is_returnable, return_rules,
         is_active, min_stock_alert, meta_title, meta_description
       )
       VALUES (
         $1, $2, $3, $4, $5, $6, $7,
         $8, $9, $10, $11, $12, $13,
         $14, $15, $16, $17, $18,
         $19, $20, $21, $22
       )
       RETURNING *`,
      [
        input.sku,
        input.slug,
        input.name,
        input.description ?? null,
        input.shortDescription ?? null,
        input.brandId ?? null,
        input.categoryId,
        input.weightKg ?? null,
        input.volumeDesi ?? null,
        input.dimensionsLwh ?? null,
        input.material ?? null,
        input.usageArea ?? null,
        input.seasonTags ?? null,
        input.isHazardous ?? false,
        input.msdsPdfUrl ?? null,
        input.warrantyMonths ?? null,
        input.isReturnable ?? true,
        input.returnRules ?? null,
        input.isActive ?? true,
        input.minStockAlert ?? 5,
        input.metaTitle ?? null,
        input.metaDescription ?? null,
      ],
    );

    return this.mapRow(result.rows[0]);
  }

  async createWithVariants(input: CreateProductInput, variants: Omit<CreateVariantInput, "productId">[]) {
    return withTransaction(async (client) => {
      const product = await this.create(input, client);

      for (const variant of variants) {
        await this.createVariant({ ...variant, productId: product.id }, client);
      }

      return product;
    });
  }

  async update(
    id: string,
    input: UpdateProductInput,
    client?: PoolClient,
  ): Promise<ProductRecord | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    const mapping: Record<keyof UpdateProductInput, string> = {
      slug: "slug",
      name: "name",
      description: "description",
      shortDescription: "short_description",
      brandId: "brand_id",
      categoryId: "category_id",
      weightKg: "weight_kg",
      volumeDesi: "volume_desi",
      dimensionsLwh: "dimensions_lwh",
      material: "material",
      usageArea: "usage_area",
      seasonTags: "season_tags",
      isHazardous: "is_hazardous",
      msdsPdfUrl: "msds_pdf_url",
      warrantyMonths: "warranty_months",
      isReturnable: "is_returnable",
      returnRules: "return_rules",
      isActive: "is_active",
      minStockAlert: "min_stock_alert",
      metaTitle: "meta_title",
      metaDescription: "meta_description",
    };

    for (const [key, column] of Object.entries(mapping) as [
      keyof UpdateProductInput,
      string,
    ][]) {
      if (input[key] !== undefined) {
        values.push(input[key]);
        fields.push(`${column} = $${values.length}`);
      }
    }

    if (fields.length === 0) {
      return this.findById(id, client);
    }

    values.push(id);
    const result = await this.getExecutor(client).query<ProductRow>(
      `UPDATE products
       SET ${fields.join(", ")}, updated_at = NOW()
       WHERE id = $${values.length}
       RETURNING *`,
      values,
    );

    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  async findBySlug(slug: string, client?: PoolClient): Promise<ProductRecord | null> {
    const result = await this.getExecutor(client).query<ProductRow>(
      `SELECT * FROM products WHERE slug = $1`,
      [slug],
    );

    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  async findBySku(sku: string, client?: PoolClient): Promise<ProductRecord | null> {
    const result = await this.getExecutor(client).query<ProductRow>(
      `SELECT * FROM products WHERE sku = $1`,
      [sku],
    );

    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  async list(filter: ProductListFilter = {}, client?: PoolClient) {
    const where: string[] = [];
    const params: unknown[] = [];
    let searchQueryParam: string | null = null;

    if (filter.isActive !== null) {
      params.push(filter.isActive ?? true);
      where.push(`p.is_active = $${params.length}`);
    }

    if (filter.categoryId) {
      params.push(filter.categoryId);
      where.push(`p.category_id IN (
        SELECT descendant_id FROM category_closure WHERE ancestor_id = $${params.length}
      )`);
    }

    if (filter.brandId) {
      params.push(filter.brandId);
      where.push(`p.brand_id = $${params.length}`);
    }

    if (filter.minPriceCents !== undefined) {
      params.push(filter.minPriceCents);
      where.push(`EXISTS (
        SELECT 1 FROM product_variants pv
        WHERE pv.product_id = p.id AND pv.is_active = TRUE AND pv.price_cents >= $${params.length}
      )`);
    }

    if (filter.maxPriceCents !== undefined) {
      params.push(filter.maxPriceCents);
      where.push(`EXISTS (
        SELECT 1 FROM product_variants pv
        WHERE pv.product_id = p.id AND pv.is_active = TRUE AND pv.price_cents <= $${params.length}
      )`);
    }

    if (filter.q) {
      params.push(filter.q.trim());
      const queryParam = `$${params.length}`;
      searchQueryParam = queryParam;
      where.push(`(
        p.search_vector @@ plainto_tsquery('simple', unaccent(${queryParam}))
        OR unaccent(p.sku) ILIKE '%' || unaccent(${queryParam}) || '%'
        OR unaccent(p.name) ILIKE '%' || unaccent(${queryParam}) || '%'
        OR unaccent(COALESCE(p.short_description, '')) ILIKE '%' || unaccent(${queryParam}) || '%'
        OR unaccent(COALESCE(p.description, '')) ILIKE '%' || unaccent(${queryParam}) || '%'
        OR EXISTS (
          SELECT 1 FROM product_variants pv
          WHERE pv.product_id = p.id
            AND unaccent(pv.sku) ILIKE '%' || unaccent(${queryParam}) || '%'
        )
      )`);
    }

    const limit = Math.min(filter.limit ?? 50, 100);
    const offset = filter.offset ?? 0;
    const totalResult = await this.getExecutor(client).query<{ total: string }>(
      `SELECT COUNT(DISTINCT p.id)::TEXT AS total
       FROM products p
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""}`,
      params,
    );

    const orderBy = searchQueryParam && !filter.sort
      ? `CASE
          WHEN unaccent(p.sku) ILIKE unaccent(${searchQueryParam}) THEN 0
          WHEN unaccent(p.name) ILIKE unaccent(${searchQueryParam}) THEN 1
          WHEN unaccent(p.sku) ILIKE unaccent(${searchQueryParam}) || '%' THEN 2
          WHEN unaccent(p.name) ILIKE unaccent(${searchQueryParam}) || '%' THEN 3
          WHEN EXISTS (
            SELECT 1 FROM product_variants pv
            WHERE pv.product_id = p.id
              AND unaccent(pv.sku) ILIKE unaccent(${searchQueryParam}) || '%'
          ) THEN 4
          ELSE 5
        END, p.name ASC, p.created_at DESC`
      : this.getOrderBy(filter.sort);
    params.push(limit, offset);

    const result = await this.getExecutor(client).query<ProductRow>(
      `SELECT p.*
       FROM products p
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY ${orderBy}
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    return {
      items: result.rows.map((row) => this.mapRow(row)),
      total: Number(totalResult.rows[0]?.total ?? 0),
    };
  }

  async search(q: string, client?: PoolClient) {
    return this.list({ q, limit: 25 }, client);
  }

  async createVariant(input: CreateVariantInput, client?: PoolClient) {
    const result = await this.getExecutor(client).query<VariantRow>(
      `INSERT INTO product_variants (
         product_id, sku, options, price_cents, compare_at_price_cents, cost_cents, is_active
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        input.productId,
        input.sku,
        input.options,
        input.priceCents,
        input.compareAtPriceCents ?? null,
        input.costCents ?? null,
        input.isActive ?? true,
      ],
    );

    return this.mapVariant(result.rows[0]);
  }

  async findVariantById(variantId: string, client?: PoolClient) {
    const result = await this.getExecutor(client).query<VariantRow>(
      `SELECT * FROM product_variants WHERE id = $1`,
      [variantId],
    );

    return result.rows[0] ? this.mapVariant(result.rows[0]) : null;
  }

  async findCartVariantById(variantId: string, client?: PoolClient) {
    const result = await this.getExecutor(client).query<CartVariantRow>(
      `SELECT
         pv.*,
         p.name AS product_name,
         p.slug AS product_slug,
         p.is_active AS product_is_active,
         p.weight_kg,
         p.volume_desi,
         p.is_hazardous
       FROM product_variants pv
       JOIN products p ON p.id = pv.product_id
       WHERE pv.id = $1`,
      [variantId],
    );

    return result.rows[0] ? this.mapCartVariant(result.rows[0]) : null;
  }

  async findReturnableByVariantId(variantId: string, client?: PoolClient) {
    const result = await this.getExecutor(client).query<ReturnableVariantRow>(
      `SELECT
         pv.id AS variant_id,
         p.id AS product_id,
         p.name AS product_name,
         p.is_returnable,
         p.return_rules
       FROM product_variants pv
       JOIN products p ON p.id = pv.product_id
       WHERE pv.id = $1`,
      [variantId],
    );

    const row = result.rows[0];
    if (!row) return null;
    return {
      variantId: row.variant_id,
      productId: row.product_id,
      productName: row.product_name,
      isReturnable: row.is_returnable,
      returnRules: row.return_rules,
    };
  }

  async updateVariant(
    productId: string,
    variantId: string,
    input: Partial<Omit<CreateVariantInput, "productId">>,
    client?: PoolClient,
  ) {
    const fields: string[] = [];
    const values: unknown[] = [];
    const mapping: Record<keyof Partial<Omit<CreateVariantInput, "productId">>, string> = {
      sku: "sku",
      options: "options",
      priceCents: "price_cents",
      compareAtPriceCents: "compare_at_price_cents",
      costCents: "cost_cents",
      isActive: "is_active",
    };

    for (const [key, column] of Object.entries(mapping) as [
      keyof Partial<Omit<CreateVariantInput, "productId">>,
      string,
    ][]) {
      if (input[key] !== undefined) {
        values.push(input[key]);
        fields.push(`${column} = $${values.length}`);
      }
    }

    if (fields.length === 0) {
      const result = await this.getExecutor(client).query<VariantRow>(
        `SELECT * FROM product_variants WHERE id = $1 AND product_id = $2`,
        [variantId, productId],
      );
      return result.rows[0] ? this.mapVariant(result.rows[0]) : null;
    }

    values.push(variantId, productId);
    const result = await this.getExecutor(client).query<VariantRow>(
      `UPDATE product_variants
       SET ${fields.join(", ")}, updated_at = NOW()
       WHERE id = $${values.length - 1} AND product_id = $${values.length}
       RETURNING *`,
      values,
    );

    return result.rows[0] ? this.mapVariant(result.rows[0]) : null;
  }

  async listVariants(productId: string, client?: PoolClient) {
    const result = await this.getExecutor(client).query<VariantRow>(
      `SELECT * FROM product_variants WHERE product_id = $1 ORDER BY created_at ASC`,
      [productId],
    );

    return result.rows.map((row) => this.mapVariant(row));
  }

  async createImage(input: CreateImageInput, client?: PoolClient) {
    const result = await this.getExecutor(client).query<ImageRow>(
      `INSERT INTO product_images (
         product_id, url, thumbnail_url, webp_url, alt_text, sort_order
       )
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        input.productId,
        input.url,
        input.thumbnailUrl ?? null,
        input.webpUrl ?? null,
        input.altText ?? null,
        input.sortOrder ?? 0,
      ],
    );

    return this.mapImage(result.rows[0]);
  }

  async listImages(productId: string, client?: PoolClient) {
    const result = await this.getExecutor(client).query<ImageRow>(
      `SELECT * FROM product_images WHERE product_id = $1 ORDER BY sort_order ASC, created_at ASC`,
      [productId],
    );

    return result.rows.map((row) => this.mapImage(row));
  }

  async getWithRelations(id: string, client?: PoolClient): Promise<ProductWithRelations | null> {
    const product = await this.findById(id, client);
    if (!product) {
      return null;
    }

    const [variants, images] = await Promise.all([
      this.listVariants(id, client),
      this.listImages(id, client),
    ]);

    return {
      ...product,
      brand: null,
      category: null,
      variants,
      images,
    };
  }

  async getWithRelationsBySlug(slug: string, client?: PoolClient) {
    const product = await this.findBySlug(slug, client);
    if (!product) {
      return null;
    }

    return this.getWithRelations(product.id, client);
  }

  async softDelete(id: string, client?: PoolClient) {
    return this.update(id, { isActive: false }, client);
  }

  private getOrderBy(sort: ProductListFilter["sort"]) {
    switch (sort) {
      case "price_asc":
        return `(SELECT MIN(price_cents) FROM product_variants pv WHERE pv.product_id = p.id AND pv.is_active = TRUE) ASC NULLS LAST, p.created_at DESC`;
      case "price_desc":
        return `(SELECT MIN(price_cents) FROM product_variants pv WHERE pv.product_id = p.id AND pv.is_active = TRUE) DESC NULLS LAST, p.created_at DESC`;
      case "name_asc":
        return "p.name ASC";
      case "newest":
      default:
        return "p.created_at DESC";
    }
  }
}
