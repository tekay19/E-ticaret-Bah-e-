import {
  BrandRepository,
  CategoryRepository,
  InventoryRepository,
  ProductRepository,
  type CreateProductInput,
  type ProductListFilter,
  type ProductRecord,
  type ProductVariantRecord,
  type ProductWithRelations,
} from "@bahce-shop/repositories";
import { NotFoundError, ValidationError, toSlug } from "@bahce-shop/shared";

export type PublicProductFilter = ProductListFilter & {
  page?: number;
  categorySlug?: string;
  brandSlug?: string;
};

export type AdminProductFilter = PublicProductFilter & {
  isActive?: boolean | null;
};

export type CsvProductPreviewRow = {
  sku: string;
  name: string;
  category_slug: string;
  brand_slug?: string;
};

export class CatalogService {
  private readonly brands = new BrandRepository();
  private readonly categories = new CategoryRepository();
  private readonly inventory = new InventoryRepository();
  private readonly products = new ProductRepository();

  async createBrand(input: { name: string; slug?: string; logoUrl?: string | null }) {
    return this.brands.create({
      ...input,
      slug: input.slug ?? toSlug(input.name),
    });
  }

  async listBrands() {
    return this.brands.list();
  }

  async createCategory(input: {
    parentId?: string | null;
    name: string;
    slug?: string;
    description?: string | null;
    imageUrl?: string | null;
    metaTitle?: string | null;
    metaDescription?: string | null;
    sortOrder?: number;
    isActive?: boolean;
  }) {
    return this.categories.create({
      ...input,
      slug: input.slug ?? toSlug(input.name),
    });
  }

  async updateCategory(id: string, input: Parameters<CategoryRepository["update"]>[1]) {
    const category = await this.categories.update(id, input);
    if (!category) {
      throw new NotFoundError("Kategori bulunamadi.");
    }

    return category;
  }

  async moveCategory(id: string, parentId: string | null) {
    if (id === parentId) {
      throw new ValidationError("Kategori kendi altina tasinamaz.");
    }

    if (parentId) {
      const descendants = await this.categories.getDescendants(id);
      if (descendants.some((category) => category.id === parentId)) {
        throw new ValidationError("Kategori kendi alt kategorisinin altina tasinamaz.");
      }
    }

    const category = await this.categories.move(id, parentId);
    if (!category) {
      throw new NotFoundError("Kategori bulunamadi.");
    }

    return category;
  }

  async getCategoryTree() {
    return this.categories.getTree();
  }

  async getAdminCategoryTree() {
    return this.categories.getAdminTree();
  }

  async createProduct(input: CreateProductInput & {
    variants: Array<{
      sku: string;
      options: Record<string, unknown>;
      priceCents: number;
      compareAtPriceCents?: number | null;
      costCents?: number | null;
      isActive?: boolean;
    }>;
  }) {
    await this.ensureCategoryExists(input.categoryId);

    if (input.brandId) {
      await this.ensureBrandExists(input.brandId);
    }

    const { variants, ...productInput } = input;
    return this.products.createWithVariants(
      {
        ...productInput,
        slug: productInput.slug || toSlug(productInput.name),
      },
      variants,
    );
  }

  async updateProduct(id: string, input: Parameters<ProductRepository["update"]>[1]) {
    if (input.categoryId) {
      await this.ensureCategoryExists(input.categoryId);
    }
    if (input.brandId) {
      await this.ensureBrandExists(input.brandId);
    }

    const product = await this.products.update(id, input);
    if (!product) {
      throw new NotFoundError("Urun bulunamadi.");
    }

    return product;
  }

  async listProducts(filter: PublicProductFilter = {}) {
    return this.listProductCollection(filter, true);
  }

  async listAdminProducts(filter: AdminProductFilter = {}) {
    return this.listProductCollection({
      ...filter,
      isActive: filter.isActive === undefined ? null : filter.isActive,
    }, false);
  }

  private async listProductCollection(filter: AdminProductFilter = {}, publicOnly: boolean) {
    const page = Math.max(filter.page ?? 1, 1);
    const limit = Math.min(filter.limit ?? 24, 100);
    const [category, brand] = await Promise.all([
      filter.categorySlug ? this.categories.findBySlug(filter.categorySlug) : Promise.resolve(null),
      filter.brandSlug ? this.brands.findBySlug(filter.brandSlug) : Promise.resolve(null),
    ]);

    if ((filter.categorySlug && !category) || (filter.brandSlug && !brand)) {
      return {
        data: [],
        meta: {
          total: 0,
          page,
          limit,
        },
      };
    }

    const result = await this.products.list({
      ...filter,
      isActive: publicOnly ? true : filter.isActive,
      categoryId: filter.categoryId ?? category?.id,
      brandId: filter.brandId ?? brand?.id,
      limit,
      offset: (page - 1) * limit,
    });

    return {
      data: await Promise.all(result.items.map((product) => this.enrichProductSummary(product))),
      meta: {
        total: result.total,
        page,
        limit,
      },
    };
  }

  async searchProducts(query: string) {
    const result = await this.products.search(query);

    return {
      data: await Promise.all(result.items.map((product) => this.enrichProductSummary(product))),
      meta: {
        total: result.total,
        page: 1,
        limit: 25,
      },
    };
  }

  async getProductBySlug(slug: string) {
    const product = await this.products.getWithRelationsBySlug(slug);
    if (!product) {
      throw new NotFoundError("Urun bulunamadi.");
    }

    const [brand, category, breadcrumb] = await Promise.all([
      product.brandId ? this.brands.findById(product.brandId) : Promise.resolve(null),
      this.categories.findById(product.categoryId),
      this.categories.getAncestors(product.categoryId),
    ]);

    return this.enrichProductDetail({
      ...product,
      brand,
      category,
      breadcrumb,
    }, false);
  }

  async getAdminProductById(id: string) {
    const product = await this.products.getWithRelations(id);
    if (!product) {
      throw new NotFoundError("Urun bulunamadi.");
    }

    const [brand, category, breadcrumb] = await Promise.all([
      product.brandId ? this.brands.findById(product.brandId) : Promise.resolve(null),
      this.categories.findById(product.categoryId),
      this.categories.getAncestors(product.categoryId),
    ]);

    return this.enrichProductDetail({
      ...product,
      brand,
      category,
      breadcrumb,
    }, true);
  }

  async relatedProducts(slug: string, limit = 4) {
    const product = await this.products.findBySlug(slug);
    if (!product || !product.isActive) {
      throw new NotFoundError("Urun bulunamadi.");
    }

    const result = await this.products.list({
      categoryId: product.categoryId,
      limit: Math.min(limit + 1, 12),
    });
    const related = result.items.filter((item) => item.id !== product.id).slice(0, limit);

    return {
      data: await Promise.all(related.map((item) => this.enrichProductSummary(item))),
    };
  }

  async addVariant(
    productId: string,
    input: {
      sku: string;
      options?: Record<string, unknown>;
      priceCents: number;
      compareAtPriceCents?: number | null;
      costCents?: number | null;
      isActive?: boolean;
    },
  ) {
    await this.ensureProductExists(productId);

    return this.products.createVariant({
      ...input,
      options: input.options ?? {},
      productId,
    });
  }

  async updateVariant(
    productId: string,
    variantId: string,
    input: Parameters<ProductRepository["updateVariant"]>[2],
  ) {
    await this.ensureProductExists(productId);
    const variant = await this.products.updateVariant(productId, variantId, input);
    if (!variant) {
      throw new NotFoundError("Varyant bulunamadi.");
    }

    return variant;
  }

  async deleteProduct(id: string) {
    const product = await this.products.softDelete(id);
    if (!product) {
      throw new NotFoundError("Urun bulunamadi.");
    }

    return product;
  }

  async deleteCategory(id: string) {
    const deleted = await this.categories.deleteIfEmpty(id);
    if (!deleted) {
      throw new ValidationError("Kategori silinemedi. Alt kategori veya urun iceriyor olabilir.");
    }

    return { success: true };
  }

  async confirmImage(input: {
    productId: string;
    url: string;
    thumbnailUrl?: string | null;
    webpUrl?: string | null;
    altText?: string | null;
  }) {
    await this.ensureProductExists(input.productId);

    return this.products.createImage(input);
  }

  async listSitemapEntries() {
    const [products, categories] = await Promise.all([
      this.products.list({ limit: 100 }),
      this.categories.listActive(),
    ]);

    return {
      products: products.items,
      categories,
    };
  }

  async dryRunCsvImport(rows: CsvProductPreviewRow[]) {
    const result = {
      toCreate: 0,
      toUpdate: 0,
      errors: [] as Array<{ row: number; sku?: string; message: string }>,
    };

    for (const [index, row] of rows.entries()) {
      const [existing, category, brand] = await Promise.all([
        this.products.findBySku(row.sku),
        this.categories.findBySlug(row.category_slug),
        row.brand_slug ? this.brands.findBySlug(row.brand_slug) : Promise.resolve(null),
      ]);

      if (!category) {
        result.errors.push({
          row: index + 2,
          sku: row.sku,
          message: `Kategori bulunamadi: ${row.category_slug}`,
        });
      }

      if (row.brand_slug && !brand) {
        result.errors.push({
          row: index + 2,
          sku: row.sku,
          message: `Marka bulunamadi: ${row.brand_slug}`,
        });
      }

      if (existing) {
        result.toUpdate += 1;
      } else {
        result.toCreate += 1;
      }
    }

    return result;
  }

  async addProcessedImage(input: {
    productId: string;
    url: string;
    thumbnailUrl: string;
    webpUrl: string;
    altText?: string | null;
  }) {
    const product = await this.products.findById(input.productId);
    if (!product) {
      throw new NotFoundError("Urun bulunamadi.");
    }

    return this.products.createImage(input);
  }

  private async ensureCategoryExists(id: string) {
    const category = await this.categories.findById(id);
    if (!category) {
      throw new NotFoundError("Kategori bulunamadi.");
    }
  }

  private async ensureBrandExists(id: string) {
    const brand = await this.brands.findById(id);
    if (!brand) {
      throw new NotFoundError("Marka bulunamadi.");
    }
  }

  private async ensureProductExists(id: string) {
    const product = await this.products.findById(id);
    if (!product) {
      throw new NotFoundError("Urun bulunamadi.");
    }
  }

  private async enrichProductSummary(product: ProductRecord) {
    const [variants, images, category] = await Promise.all([
      this.products.listVariants(product.id),
      this.products.listImages(product.id),
      this.categories.findById(product.categoryId),
    ]);
    const activeVariants = variants.filter((variant) => variant.isActive);
    const stock = await this.stockForVariants(activeVariants);

    return {
      ...product,
      category,
      variants: activeVariants,
      images,
      primaryImage: images[0] ?? null,
      stock,
      stockStatus: this.stockStatus(stock.available, product.minStockAlert),
    };
  }

  private async enrichProductDetail(product: ProductWithRelations & {
    breadcrumb: Awaited<ReturnType<CategoryRepository["getAncestors"]>>;
  }, includeInactiveVariants: boolean) {
    const activeVariants = includeInactiveVariants ? product.variants : product.variants.filter((variant) => variant.isActive);
    const stock = await this.stockForVariants(activeVariants);

    return {
      ...product,
      variants: activeVariants,
      primaryImage: product.images[0] ?? null,
      stock,
      stockStatus: this.stockStatus(stock.available, product.minStockAlert),
    };
  }

  private async stockForVariants(variants: ProductVariantRecord[]) {
    const rows = await Promise.all(
      variants.map(async (variant) => this.inventory.findByVariantId(variant.id)),
    );
    const byVariant = rows.map((row, index) => ({
      variantId: variants[index].id,
      available: row?.available ?? 0,
      onHand: row?.onHand ?? 0,
      reserved: row?.reserved ?? 0,
    }));

    return {
      available: byVariant.reduce((sum, row) => sum + row.available, 0),
      variants: byVariant,
    };
  }

  private stockStatus(available: number, minStockAlert: number) {
    if (available <= 0) return "out_of_stock";
    if (available <= minStockAlert) return "low_stock";
    return "in_stock";
  }
}
