import type { Job } from "bullmq";
import { InventoryRepository } from "@bahce-shop/repositories";
import { logger } from "@bahce-shop/shared";
import { BaseWorker, createQueue } from "./base.worker.js";
import { createRedisClient } from "./redis.js";

export const RESERVATION_CLEANUP_QUEUE_NAME = "reservation-cleanup";

type CleanupPayload = {
  requestedAt: string;
};

let cleanupQueueSingleton: ReturnType<typeof createQueue<CleanupPayload>> | null = null;

export function createReservationCleanupQueue() {
  if (!cleanupQueueSingleton) {
    cleanupQueueSingleton = createQueue<CleanupPayload>(RESERVATION_CLEANUP_QUEUE_NAME);
  }

  return cleanupQueueSingleton;
}

export class ReservationCleanupWorker extends BaseWorker<CleanupPayload> {
  protected queueName = RESERVATION_CLEANUP_QUEUE_NAME;

  private readonly inventory = new InventoryRepository();
  private readonly redis = createRedisClient("reservation-cleanup");

  protected async handle(job: Job<CleanupPayload>) {
    const expired = await this.inventory.listExpiredReservations();

    for (const reservation of expired) {
      await this.inventory.releaseReservation(reservation.referenceId);
      await this.inventory.adjustReserved(reservation.variantId, -reservation.quantity);
      await this.redis.del(`res:${reservation.referenceId}`);

      const key = `stock:${reservation.variantId}`;
      const current = JSON.parse((await this.redis.get(key)) ?? '{"onHand":0,"reserved":0}') as {
        onHand: number;
        reserved: number;
      };
      current.reserved = Math.max(0, current.reserved - reservation.quantity);
      await this.redis.set(key, JSON.stringify(current));
    }

    logger.info({ jobId: job.id, released: expired.length }, "expired reservations released");
    return { released: expired.length };
  }
}
