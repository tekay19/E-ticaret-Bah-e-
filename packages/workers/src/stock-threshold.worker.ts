import type { Job } from "bullmq";
import { InventoryRepository } from "@bahce-shop/repositories";
import { logger } from "@bahce-shop/shared";
import { BaseWorker, createQueue } from "./base.worker.js";
import { createRedisClient } from "./redis.js";

export const STOCK_THRESHOLD_QUEUE_NAME = "stock-threshold";

type ThresholdPayload = {
  requestedAt: string;
};

let thresholdQueueSingleton: ReturnType<typeof createQueue<ThresholdPayload>> | null = null;

export function createStockThresholdQueue() {
  if (!thresholdQueueSingleton) {
    thresholdQueueSingleton = createQueue<ThresholdPayload>(STOCK_THRESHOLD_QUEUE_NAME);
  }

  return thresholdQueueSingleton;
}

export class StockThresholdWorker extends BaseWorker<ThresholdPayload> {
  protected queueName = STOCK_THRESHOLD_QUEUE_NAME;

  private readonly inventory = new InventoryRepository();
  private readonly redis = createRedisClient("stock-threshold");

  protected async handle(job: Job<ThresholdPayload>) {
    const lowStockItems = await this.inventory.listLowStock();
    const notified: string[] = [];

    for (const item of lowStockItems) {
      const key = `low-stock-notified:${item.variantId}`;
      const alreadySent = await this.redis.get(key);
      if (alreadySent) {
        continue;
      }

      await this.redis.set(key, "1", "EX", 24 * 60 * 60);
      notified.push(item.variantId);
      logger.warn({ item }, "low stock threshold reached");
    }

    logger.info(
      { jobId: job.id, found: lowStockItems.length, notified: notified.length },
      "stock threshold check completed",
    );

    return {
      found: lowStockItems.length,
      notified,
    };
  }
}
