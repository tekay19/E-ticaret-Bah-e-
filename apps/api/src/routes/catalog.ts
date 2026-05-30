import { randomUUID } from "node:crypto";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { parse } from "csv-parse/sync";
import { z } from "zod";
import type { ZodType } from "zod";
import {
  CatalogService,
  CustomerEngagementService,
  brandInputSchema,
  categoryInputSchema,
  categoryUpdateSchema,
  productReviewInputSchema,
  imageConfirmInputSchema,
  imageUploadUrlInputSchema,
  productInputSchema,
  productListQuerySchema,
  productUpdateSchema,
  productVariantInputSchema,
  productVariantUpdateSchema,
} from "@bahce-shop/domain";
import { S3Service } from "@bahce-shop/integrations";
import { AuditLogRepository } from "@bahce-shop/repositories";
import { query as dbQuery } from "@bahce-shop/db";
import { ValidationError, env, toSlug } from "@bahce-shop/shared";
import {
  createCsvImporterQueue,
  createImageProcessorQueue,
  createRedisClient,
  type CsvProductRow,
} from "@bahce-shop/workers";

function parseBody<T>(schema: ZodType<T>, payload: unknown): T {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues.map((issue) => issue.message).join(", "));
  }

  return parsed.data;
}

function parseCsv(csv: string): CsvProductRow[] {
  const rows = parse(csv, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as CsvProductRow[];

  return rows.map((row, index) => {
    const missing = ["sku", "name", "category_slug", "price_cents"].filter(
      (key) => !row[key as keyof CsvProductRow],
    );
    if (missing.length > 0) {
      throw new ValidationError(`CSV satir ${index + 2}: eksik alanlar: ${missing.join(", ")}`);
    }

    if (!Number.isInteger(Number(row.price_cents)) || Number(row.price_cents) < 0) {
      throw new ValidationError(`CSV satir ${index + 2}: price_cents gecersiz.`);
    }

    return row;
  });
}

const storefrontSettingsSchema = z.object({
  promoText: z.string().min(1).max(220).optional(),
  phoneLabel: z.string().min(1).max(40).optional(),
  phoneNumber: z.string().min(1).max(40).optional(),
  dailyDealLabel: z.string().min(1).max(60).optional(),
  weeklyDealsTitle: z.string().min(1).max(80).optional(),
  weeklyDealsSubtitle: z.string().max(180).optional(),
  weeklyDealsLimit: z.number().int().min(1).max(12).optional(),
  weeklyCountdownDays: z.number().int().min(0).max(999).optional(),
  weeklyCountdownHours: z.number().int().min(0).max(23).optional(),
  weeklyCountdownMinutes: z.number().int().min(0).max(59).optional(),
  promoCardOneEyebrow: z.string().min(1).max(80).optional(),
  promoCardOneTitle: z.string().min(1).max(120).optional(),
  promoCardOneButton: z.string().min(1).max(40).optional(),
  promoCardTwoEyebrow: z.string().min(1).max(80).optional(),
  promoCardTwoTitle: z.string().min(1).max(120).optional(),
  promoCardTwoButton: z.string().min(1).max(40).optional(),
  wideBannerTitle: z.string().min(1).max(120).optional(),
  wideBannerButton: z.string().min(1).max(40).optional(),
  fallbackCategories: z.array(z.object({
    id: z.string().min(1).max(120),
    name: z.string().min(1).max(120),
    slug: z.string().min(1).max(140),
  })).min(1).max(12).optional(),
  orderStatusLabels: z.record(z.string().min(1).max(80)).optional(),
  returnReasonLabels: z.record(z.string().min(1).max(80)).optional(),
  returnStatusLabels: z.record(z.string().min(1).max(80)).optional(),
  returnConditionLabels: z.record(z.string().min(1).max(80)).optional(),
  checkoutAddressDefaults: z.object({
    title: z.string().min(1).max(60),
    fullName: z.string().min(1).max(120),
    phone: z.string().min(1).max(40),
    city: z.string().min(1).max(80),
    district: z.string().min(1).max(80),
    postalCode: z.string().min(1).max(20),
    addressLine: z.string().min(1).max(240),
  }).optional(),
  contactInfo: z.object({
    address: z.string().min(1).max(240),
    phone: z.string().min(1).max(40),
    email: z.string().email().max(160),
    mapLabel: z.string().min(1).max(80),
  }).optional(),
  blogPosts: z.array(z.object({
    id: z.string().min(1).max(120),
    title: z.string().min(1).max(140),
    excerpt: z.string().min(1).max(280),
    contentHtml: z.string().min(1).max(2500000),
    date: z.string().min(1).max(60),
    author: z.string().min(1).max(80),
    imageUrl: z.string().min(1).max(2500000),
    fontFamily: z.string().min(1).max(80),
    fontSize: z.string().min(1).max(20),
    textColor: z.string().min(1).max(30),
    isFeatured: z.boolean(),
  })).min(1).max(12).optional(),
});

const defaultStorefrontSettings = {
  promoText: "İlk siparişe özel %25’e varan fırsat: GET25OFF - HEMEN ALIŞVERİŞE BAŞLA",
  phoneLabel: "Hemen Ara:",
  phoneNumber: "9876-543-210",
  dailyDealLabel: "Günün Fırsatları",
  weeklyDealsTitle: "Haftanın Fırsatları",
  weeklyDealsSubtitle: "Bahçe ve el aletleri için özenle seçilmiş ürünleri keşfedin.",
  weeklyDealsLimit: 6,
  weeklyCountdownDays: 327,
  weeklyCountdownHours: 14,
  weeklyCountdownMinutes: 31,
  promoCardOneEyebrow: "Kaçırma! Sıcak Fırsat",
  promoCardOneTitle: "Bahçe işleri için güçlü ürünler",
  promoCardOneButton: "Hemen Al",
  promoCardTwoEyebrow: "Kaçırma! Sıcak Fırsat",
  promoCardTwoTitle: "Dayanıklı el aletleri ve ekipmanlar",
  promoCardTwoButton: "Hemen Al",
  wideBannerTitle: "Bahçe ve tamir ürünlerinde güçlü fırsatlar",
  wideBannerButton: "Alışverişe Başla",
  fallbackCategories: [
    { id: "Hammer Tool", name: "Çekiç Grubu", slug: "hammer-tool" },
    { id: "Drill Tool", name: "Matkap Grubu", slug: "drill-tool" },
    { id: "Circular Saw", name: "Daire Testere", slug: "circular-saw" },
    { id: "Wrench Tool", name: "Anahtar Takımı", slug: "wrench-tool" },
    { id: "Decker Tool", name: "Decker Aletleri", slug: "decker-tool" },
    { id: "Power Saw", name: "Motorlu Testere", slug: "power-saw" },
  ],
  orderStatusLabels: {
    pending_payment: "Ödeme bekliyor",
    paid: "Ödendi",
    preparing: "Hazırlanıyor",
    shipped: "Kargoda",
    delivered: "Teslim edildi",
    completed: "Tamamlandı",
    cancelled: "İptal",
  },
  returnReasonLabels: {
    cayma_hakki: "Cayma hakkı",
    hasarli_kargo: "Hasarlı kargo",
    yanlis_urun: "Yanlış ürün",
    defolu_urun: "Defolu ürün",
    aciklamayla_uyumsuz: "Açıklamayla uyumsuz",
  },
  returnStatusLabels: {
    requested: "Talep alındı",
    approved: "Onaylandı",
    rejected: "Reddedildi",
    in_transit: "Geri kargoda",
    received: "Teslim alındı",
    refunded: "İade ödendi",
    cancelled: "İptal edildi",
  },
  returnConditionLabels: {
    unopened: "Açılmamış",
    opened: "Açılmış",
    damaged: "Hasarlı",
    missing: "Eksik",
  },
  checkoutAddressDefaults: {
    title: "Ev",
    fullName: "Web Müşterisi",
    phone: "5551234567",
    city: "İstanbul",
    district: "Kadıköy",
    postalCode: "34000",
    addressLine: "Web ödeme test adresi",
  },
  contactInfo: {
    address: "Kadıköy, İstanbul",
    phone: "0216 000 00 00",
    email: "destek@bahceshop.com",
    mapLabel: "Mağaza Konumu",
  },
  blogPosts: [
    {
      id: "bahce-aleti-secimi",
      title: "Bahçe Aleti Seçerken Nelere Bakmalı?",
      excerpt: "Doğru ürünü seçmek ve sipariş sürecini daha rahat yönetmek için kısa, pratik öneriler.",
      contentHtml: "<p>Bahçe aleti seçerken ürünün kullanım alanına, malzeme kalitesine ve servis desteğine birlikte bakmak gerekir.</p>",
      date: "9 Şubat 2024",
      author: "Editör",
      imageUrl: "https://demos.codezeel.com/wordpress/WCM07/WCM070167/default/wp-content/uploads/2023/10/23-460x460.jpg",
      fontFamily: "inherit",
      fontSize: "16px",
      textColor: "#1f2937",
      isFeatured: true,
    },
    {
      id: "sezon-oncesi-bakim",
      title: "Sezon Öncesi Bakım İçin 9 İpucu",
      excerpt: "Bahçe ürünlerini daha uzun ömürlü kullanmak için bakım ve saklama önerileri.",
      contentHtml: "<p>Sezon başlamadan önce ekipmanları temizlemek, bağlantıları kontrol etmek ve sarf parçaları yenilemek işinizi kolaylaştırır.</p>",
      date: "10 Şubat 2024",
      author: "Editör",
      imageUrl: "https://demos.codezeel.com/wordpress/WCM07/WCM070167/default/wp-content/uploads/2023/12/14-460x460.jpg",
      fontFamily: "inherit",
      fontSize: "16px",
      textColor: "#1f2937",
      isFeatured: true,
    },
    {
      id: "guvenli-alisveris",
      title: "Güvenli Alışveriş ve Teslimat Rehberi",
      excerpt: "Ödeme, teslimat ve iade süreçlerinde bilmen gereken temel adımlar.",
      contentHtml: "<p>Sipariş verirken adres, kargo ve ödeme özetini kontrol etmek satış sonrası süreci daha sorunsuz hale getirir.</p>",
      date: "11 Şubat 2024",
      author: "Editör",
      imageUrl: "https://demos.codezeel.com/wordpress/WCM07/WCM070167/default/wp-content/uploads/2023/12/09-460x460.jpg",
      fontFamily: "inherit",
      fontSize: "16px",
      textColor: "#1f2937",
      isFeatured: true,
    },
  ],
};

async function readStorefrontSettings() {
  const result = await dbQuery<{ value: Record<string, unknown> }>(
    `SELECT value FROM site_settings WHERE key = 'storefront'`,
  );
  return {
    ...defaultStorefrontSettings,
    ...(result.rows[0]?.value ?? {}),
  };
}

async function readCsvFromRequest(request: FastifyRequest) {
  if (request.isMultipart?.()) {
    const file = await request.file();
    if (!file) {
      throw new ValidationError("CSV dosyasi zorunludur.");
    }

    return (await file.toBuffer()).toString("utf8");
  }

  const body = request.body as { csv?: string };
  if (!body?.csv) {
    throw new ValidationError("CSV icerigi zorunludur.");
  }

  return body.csv;
}

const catalogRoutes: FastifyPluginAsync = async (app) => {
  const catalog = new CatalogService();
  const engagement = new CustomerEngagementService();
  const auditLogs = new AuditLogRepository();
  const storage = new S3Service();
  const imageQueue = createImageProcessorQueue();
  const csvQueue = createCsvImporterQueue();
  const sitemapRedis = createRedisClient("sitemap-cache");
  const adminOnly = [app.authenticate, app.roleGuard(["admin", "super_admin"])];

  app.addHook("onClose", async () => {
    await sitemapRedis.quit();
  });

  app.get("/categories", async () => {
    return {
      data: await catalog.getCategoryTree(),
    };
  });

  app.get("/site-settings", async () => {
    return {
      data: await readStorefrontSettings(),
    };
  });

  app.patch("/admin/site-settings", { preHandler: adminOnly }, async (request) => {
    const input = parseBody(storefrontSettingsSchema, request.body);
    const current = await readStorefrontSettings();
    const next = {
      ...current,
      ...input,
    };
    const result = await dbQuery<{ value: Record<string, unknown>; updated_at: Date }>(
      `INSERT INTO site_settings (key, value)
       VALUES ('storefront', $1::jsonb)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
       RETURNING value, updated_at`,
      [JSON.stringify(next)],
    );

    return {
      data: {
        ...defaultStorefrontSettings,
        ...result.rows[0].value,
        updatedAt: result.rows[0].updated_at.toISOString(),
      },
    };
  });

  app.get("/admin/categories", { preHandler: adminOnly }, async () => {
    return {
      data: await catalog.getAdminCategoryTree(),
    };
  });

  app.get("/products", async (request) => {
    const query = parseBody(productListQuerySchema, request.query);
    return catalog.listProducts({
      q: query.q,
      categorySlug: query.category,
      brandSlug: query.brand,
      minPriceCents: query.minPrice,
      maxPriceCents: query.maxPrice,
      sort: query.sort,
      page: query.page,
      limit: query.limit,
    });
  });

  app.get("/products/:slug", async (request) => {
    const params = request.params as { slug: string };
    return {
      data: await catalog.getProductBySlug(params.slug),
    };
  });

  app.get("/products/:slug/related", async (request) => {
    const params = request.params as { slug: string };
    const query = request.query as { limit?: string | number };
    const limit = Math.min(Number(query.limit ?? 4) || 4, 12);
    return catalog.relatedProducts(params.slug, limit);
  });

  app.get("/products/:slug/reviews", async (request) => {
    const params = request.params as { slug: string };
    return engagement.listReviews(params.slug);
  });

  app.post("/products/:slug/reviews", { preHandler: [app.authenticate] }, async (request) => {
    const params = request.params as { slug: string };
    const input = parseBody(productReviewInputSchema, request.body);
    return engagement.createReview(request.user!.id, params.slug, input);
  });

  app.get("/search", async (request) => {
    const query = request.query as { q?: string };
    if (!query.q) {
      throw new ValidationError("Arama sorgusu zorunludur.");
    }

    return catalog.searchProducts(query.q);
  });

  app.get("/admin/brands", { preHandler: adminOnly }, async () => {
    return {
      data: await catalog.listBrands(),
    };
  });

  app.get("/admin/products", { preHandler: adminOnly }, async (request) => {
    const query = parseBody(
      productListQuerySchema.extend({
        isActive: z.enum(["true", "false", "all"]).optional(),
      }),
      request.query,
    );
    return catalog.listAdminProducts({
      ...query,
      categorySlug: query.category,
      brandSlug: query.brand,
      isActive: query.isActive === "all" || query.isActive === undefined ? null : query.isActive === "true",
    });
  });

  app.get("/admin/products/:id", { preHandler: adminOnly }, async (request) => {
    const params = request.params as { id: string };
    return {
      data: await catalog.getAdminProductById(params.id),
    };
  });

  app.get("/admin/products/:id/history", { preHandler: adminOnly }, async (request) => {
    const params = request.params as { id: string };
    const logs = await auditLogs.list({ path: `/admin/products/${params.id}`, limit: 50 });
    const actionLabels: Record<string, string> = {
      GET: "Görüntülendi",
      POST: "Yeni kayıt eklendi",
      PATCH: "Bilgiler güncellendi",
      DELETE: "Pasife alındı",
    };

    return {
      data: logs
        .filter((log) => !log.path.endsWith("/history"))
        .map((log) => ({
          id: log.id,
          action: actionLabels[log.method] ?? log.method,
          summary: productHistorySummary(log.method, log.path),
          actorRole: log.userRole,
          statusCode: log.statusCode,
          path: log.path,
          createdAt: log.createdAt,
        })),
    };
  });

  app.post("/admin/brands", { preHandler: adminOnly }, async (request) => {
    const input = parseBody(brandInputSchema, request.body);
    return catalog.createBrand(input);
  });

  app.post("/admin/categories", { preHandler: adminOnly }, async (request) => {
    const input = parseBody(categoryInputSchema, request.body);
    return catalog.createCategory(input);
  });

  app.patch("/admin/categories/:id", { preHandler: adminOnly }, async (request) => {
    const input = parseBody(categoryUpdateSchema, request.body);
    const params = request.params as { id: string };
    return catalog.updateCategory(params.id, input);
  });

  app.patch("/admin/categories/:id/move", { preHandler: adminOnly }, async (request) => {
    const body = parseBody(
      categoryInputSchema.pick({ parentId: true }),
      request.body,
    );
    const params = request.params as { id: string };
    return catalog.moveCategory(params.id, body.parentId ?? null);
  });

  app.post("/admin/products", { preHandler: adminOnly }, async (request) => {
    const input = parseBody(productInputSchema, request.body);
    return catalog.createProduct({
      ...input,
      slug: input.slug ?? toSlug(input.name),
      variants: input.variants.map((variant) => ({
        ...variant,
        options: variant.options ?? {},
      })),
    });
  });

  app.patch("/admin/products/:id", { preHandler: adminOnly }, async (request) => {
    const input = parseBody(productUpdateSchema, request.body);
    const params = request.params as { id: string };
    return catalog.updateProduct(params.id, input);
  });

  app.delete("/admin/products/:id", { preHandler: adminOnly }, async (request) => {
    const params = request.params as { id: string };
    return catalog.deleteProduct(params.id);
  });

  app.post("/admin/products/:id/variants", { preHandler: adminOnly }, async (request) => {
    const params = request.params as { id: string };
    const input = parseBody(productVariantInputSchema, request.body);
    return catalog.addVariant(params.id, {
      ...input,
      options: input.options ?? {},
    });
  });

  app.patch("/admin/products/:id/variants/:variantId", { preHandler: adminOnly }, async (request) => {
    const params = request.params as { id: string; variantId: string };
    const input = parseBody(productVariantUpdateSchema, request.body);
    return catalog.updateVariant(params.id, params.variantId, input);
  });

  app.delete("/admin/categories/:id", { preHandler: adminOnly }, async (request) => {
    const params = request.params as { id: string };
    return catalog.deleteCategory(params.id);
  });

  app.post("/admin/images/upload-url", { preHandler: adminOnly }, async (request) => {
    const input = parseBody(imageUploadUrlInputSchema, request.body);
    const extension = input.contentType.split("/")[1];
    const key = `uploads/${randomUUID()}-${toSlug(input.fileName)}.${extension}`;

    return {
      key,
      uploadUrl: await storage.generateUploadUrl(key, input.contentType),
      publicUrl: storage.publicUrl(key),
    };
  });

  app.post("/admin/images/confirm", { preHandler: adminOnly }, async (request) => {
    const input = parseBody(imageConfirmInputSchema, request.body);
    const job = await imageQueue.add("process-product-image", input);

    return {
      jobId: job.id,
      status: "queued",
    };
  });

  app.post("/admin/products/:id/images", { preHandler: adminOnly }, async (request) => {
    const params = request.params as { id: string };
    const input = parseBody(
      imageConfirmInputSchema.omit({ productId: true }),
      request.body,
    );
    const job = await imageQueue.add("process-product-image", {
      ...input,
      productId: params.id,
    });

    return {
      jobId: job.id,
      status: "queued",
    };
  });

  app.post("/admin/products/import", { preHandler: adminOnly }, async (request) => {
    const mode = ((request.query as { mode?: string }).mode ?? "dry-run") as "dry-run" | "apply";
    if (!["dry-run", "apply"].includes(mode)) {
      throw new ValidationError("Import mode dry-run veya apply olmali.");
    }

    const csv = await readCsvFromRequest(request);
    const rows = parseCsv(csv);

    if (mode === "dry-run") {
      return {
        mode,
        ...(await catalog.dryRunCsvImport(rows)),
        rows: rows.slice(0, 25),
      };
    }

    const job = await csvQueue.add("import-products", { rows });
    return {
      jobId: job.id,
      status: "queued",
    };
  });

  app.get("/admin/products/import/:jobId/status", { preHandler: adminOnly }, async (request) => {
    const params = request.params as { jobId: string };
    const job = await csvQueue.getJob(params.jobId);
    if (!job) {
      throw new ValidationError("Import job bulunamadi.");
    }

    return {
      jobId: job.id,
      state: await job.getState(),
      progress: job.progress,
      result: job.returnvalue ?? null,
      failedReason: job.failedReason ?? null,
    };
  });

  app.get("/sitemap.xml", async (_request, reply) => {
    const cacheKey = "sitemap:xml";
    const cached = await sitemapRedis.get(cacheKey);
    if (cached) {
      return reply.type("application/xml").send(cached);
    }

    const entries = await catalog.listSitemapEntries();
    const urls = [
      ...entries.categories.map((category) => `/categories/${category.slug}`),
      ...entries.products.map((product) => `/products/${product.slug}`),
    ];
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
      .map((url) => `  <url><loc>${env.APP_BASE_URL}${url}</loc></url>`)
      .join("\n")}\n</urlset>`;

    await sitemapRedis.set(cacheKey, xml, "EX", 60 * 60);
    return reply.type("application/xml").send(xml);
  });
};

function productHistorySummary(method: string, path: string) {
  if (path.includes("/variants")) {
    return method === "POST" ? "Yeni stok kodu/fiyat satırı eklendi." : "Stok kodu/fiyat satırı güncellendi.";
  }
  if (path.includes("/images")) {
    return "Ürün görseli işleme kuyruğuna alındı.";
  }
  if (method === "DELETE") {
    return "Ürün vitrinde pasife alındı.";
  }
  if (method === "PATCH") {
    return "Ürün bilgileri güncellendi.";
  }
  if (method === "POST") {
    return "Ürün kaydı oluşturuldu.";
  }
  return "Ürün detayı açıldı.";
}

export default catalogRoutes;
