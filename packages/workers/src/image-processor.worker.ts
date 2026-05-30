import path from "node:path";
import type { Job } from "bullmq";
import sharp from "sharp";
import { S3Service } from "@bahce-shop/integrations";
import { ProductRepository } from "@bahce-shop/repositories";
import { logger } from "@bahce-shop/shared";
import { BaseWorker, createQueue } from "./base.worker.js";

export const IMAGE_PROCESSOR_QUEUE_NAME = "image-processor";

export type ImageProcessorJobPayload = {
  productId: string;
  originalKey: string;
  altText?: string | null;
};

let imageQueueSingleton: ReturnType<typeof createQueue<ImageProcessorJobPayload>> | null = null;

export function createImageProcessorQueue() {
  if (!imageQueueSingleton) {
    imageQueueSingleton = createQueue<ImageProcessorJobPayload>(IMAGE_PROCESSOR_QUEUE_NAME);
  }

  return imageQueueSingleton;
}

export class ImageProcessorWorker extends BaseWorker<ImageProcessorJobPayload> {
  protected queueName = IMAGE_PROCESSOR_QUEUE_NAME;

  private readonly storage = new S3Service();
  private readonly products = new ProductRepository();

  protected async handle(job: Job<ImageProcessorJobPayload>) {
    const original = await this.storage.download(job.data.originalKey);
    const baseKey = job.data.originalKey.replace(path.extname(job.data.originalKey), "");

    const source = sharp(original).rotate();

    const optimized = await source
      .clone()
      .trim({ background: "#ffffff", threshold: 12 })
      .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .sharpen()
      .jpeg({ quality: 92, mozjpeg: true })
      .toBuffer();

    const thumbnail = await source
      .clone()
      .trim({ background: "#ffffff", threshold: 12 })
      .resize({ width: 600, height: 600, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .sharpen()
      .jpeg({ quality: 90, mozjpeg: true })
      .toBuffer();

    const webp = await source
      .clone()
      .trim({ background: "#ffffff", threshold: 12 })
      .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
      .sharpen()
      .webp({ quality: 90, effort: 5 })
      .toBuffer();

    const optimizedKey = `${baseKey}-1600.jpg`;
    const thumbnailKey = `${baseKey}-thumb.jpg`;
    const webpKey = `${baseKey}-1600.webp`;

    const [url, thumbnailUrl, webpUrl] = await Promise.all([
      this.storage.upload(optimizedKey, optimized, "image/jpeg"),
      this.storage.upload(thumbnailKey, thumbnail, "image/jpeg"),
      this.storage.upload(webpKey, webp, "image/webp"),
    ]);

    const image = await this.products.createImage({
      productId: job.data.productId,
      url,
      thumbnailUrl,
      webpUrl,
      altText: job.data.altText ?? null,
    });

    logger.info({ jobId: job.id, imageId: image.id }, "product image processed");
  }
}
