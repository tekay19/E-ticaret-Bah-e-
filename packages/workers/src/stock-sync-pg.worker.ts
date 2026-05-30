import type { Job } from "bullmq";
import { InventoryRepository } from "@bahce-shop/repositories";
import { logger } from "@bahce-shop/shared";
import { BaseWorker, createQueue } from "./base.worker.js";

export const STOCK_SYNC_QUEUE_NAME = "stock-sync-pg";

export type StockSyncJobPayload = {
  variantId: string;
  quantity: number;
  reservationType: "cart" | "order";
  referenceId: string;
  expiresAt: string;
};

let stockSyncQueueSingleton: ReturnType<typeof createQueue<StockSyncJobPayload>> | null = null;

export function createStockSyncQueue() {
  if (!stockSyncQueueSingleton) {
    stockSyncQueueSingleton = createQueue<StockSyncJobPayload>(STOCK_SYNC_QUEUE_NAME);
  }

  return stockSyncQueueSingleton;
}

export class StockSyncPgWorker extends BaseWorker<StockSyncJobPayload> {
  protected queueName = STOCK_SYNC_QUEUE_NAME;

  private readonly inventory = new InventoryRepository();

  protected async handle(job: Job<StockSyncJobPayload>) {
    const existing = await this.inventory.findReservation(
      job.data.referenceId,
      job.data.variantId,
    );
    if (existing) {
      logger.info(
        { jobId: job.id, reservationId: existing.id },
        "reservation already synced to postgres",
      );
      return existing;
    }

    await this.inventory.upsertInventory(job.data.variantId, {});
    await this.inventory.adjustReserved(job.data.variantId, job.data.quantity);
    const reservation = await this.inventory.createReservation(job.data);

    logger.info(
      { jobId: job.id, reservationId: reservation.id },
      "reservation synced to postgres",
    );

    return reservation;
  }
}
