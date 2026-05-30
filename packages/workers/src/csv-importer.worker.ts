import type { Job } from "bullmq";
import {
  BrandRepository,
  CategoryRepository,
  ProductRepository,
} from "@bahce-shop/repositories";
import { logger, toSlug } from "@bahce-shop/shared";
import { BaseWorker, createQueue } from "./base.worker.js";

export const CSV_IMPORTER_QUEUE_NAME = "csv-importer";

export type CsvProductRow = {
  sku: string;
  name: string;
  slug?: string;
  category_slug: string;
  brand_slug?: string;
  price_cents: string;
  weight_kg?: string;
  volume_desi?: string;
  short_description?: string;
  description?: string;
};

export type CsvImporterJobPayload = {
  rows: CsvProductRow[];
};

export type CsvImporterJobResult = {
  created: number;
  updated: number;
  errors: Array<{ row: number; sku?: string; message: string }>;
};

let csvQueueSingleton: ReturnType<typeof createQueue<CsvImporterJobPayload>> | null = null;

export function createCsvImporterQueue() {
  if (!csvQueueSingleton) {
    csvQueueSingleton = createQueue<CsvImporterJobPayload>(CSV_IMPORTER_QUEUE_NAME);
  }

  return csvQueueSingleton;
}

export class CsvImporterWorker extends BaseWorker<CsvImporterJobPayload> {
  protected queueName = CSV_IMPORTER_QUEUE_NAME;

  private readonly brands = new BrandRepository();
  private readonly categories = new CategoryRepository();
  private readonly products = new ProductRepository();

  protected async handle(job: Job<CsvImporterJobPayload>): Promise<CsvImporterJobResult> {
    const result: CsvImporterJobResult = {
      created: 0,
      updated: 0,
      errors: [],
    };

    for (const [index, row] of job.data.rows.entries()) {
      try {
        const existedBefore = Boolean(await this.products.findBySku(row.sku));
        await this.applyRow(row);
        if (existedBefore) {
          result.updated += 1;
        } else {
          result.created += 1;
        }
      } catch (error) {
        result.errors.push({
          row: index + 2,
          sku: row.sku,
          message: error instanceof Error ? error.message : "Bilinmeyen hata",
        });
      }

      await job.updateProgress(Math.round(((index + 1) / job.data.rows.length) * 100));
    }

    logger.info(result, "csv import completed");
    return result;
  }

  private async applyRow(row: CsvProductRow) {
    const category = await this.categories.findBySlug(row.category_slug);
    if (!category) {
      throw new Error(`Kategori bulunamadi: ${row.category_slug}`);
    }

    const brand = row.brand_slug ? await this.brands.findBySlug(row.brand_slug) : null;
    if (row.brand_slug && !brand) {
      throw new Error(`Marka bulunamadi: ${row.brand_slug}`);
    }

    const existing = await this.products.findBySku(row.sku);
    const productInput = {
      sku: row.sku,
      slug: row.slug || toSlug(row.name),
      name: row.name,
      shortDescription: row.short_description || null,
      description: row.description || null,
      categoryId: category.id,
      brandId: brand?.id ?? null,
      weightKg: row.weight_kg || null,
      volumeDesi: row.volume_desi || null,
    };

    if (existing) {
      await this.products.update(existing.id, productInput);
      return;
    }

    await this.products.createWithVariants(productInput, [
      {
        sku: `${row.sku}-STD`,
        options: {},
        priceCents: Number(row.price_cents),
      },
    ]);
  }
}
