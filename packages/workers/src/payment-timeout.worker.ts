import type { Job } from "bullmq";
import { InventoryRepository, OrderRepository } from "@bahce-shop/repositories";
import { logger } from "@bahce-shop/shared";
import { BaseWorker, createQueue } from "./base.worker.js";
import { createRedisClient } from "./redis.js";

export const PAYMENT_TIMEOUT_QUEUE_NAME = "payment-timeout";

type PaymentTimeoutPayload = {
  requestedAt: string;
};

let paymentTimeoutQueueSingleton: ReturnType<typeof createQueue<PaymentTimeoutPayload>> | null = null;

export function createPaymentTimeoutQueue() {
  if (!paymentTimeoutQueueSingleton) {
    paymentTimeoutQueueSingleton = createQueue<PaymentTimeoutPayload>(PAYMENT_TIMEOUT_QUEUE_NAME);
  }

  return paymentTimeoutQueueSingleton;
}

export class PaymentTimeoutWorker extends BaseWorker<PaymentTimeoutPayload> {
  protected queueName = PAYMENT_TIMEOUT_QUEUE_NAME;

  private readonly inventory = new InventoryRepository();
  private readonly orders = new OrderRepository();
  private readonly redis = createRedisClient("payment-timeout");

  protected async handle(job: Job<PaymentTimeoutPayload>) {
    const timedOut = await this.orders.listTimedOutPending();
    for (const order of timedOut) {
      await this.orders.updateStatus(order.id, "cancelled", "payment_timeout", null);
      const payment = await this.orders.findPaymentByOrderId(order.id);
      if (payment && payment.status === "initialized") {
        await this.orders.markPayment(payment.id, "failed", { reason: "payment_timeout" });
      }
      await this.releaseReservations(order.id);
    }

    logger.info({ jobId: job.id, cancelled: timedOut.length }, "payment timeout check completed");
    return { cancelled: timedOut.length };
  }

  private async releaseReservations(orderId: string) {
    const items = await this.orders.listItems(orderId);

    for (const item of items) {
      const reservations = await this.inventory.releaseReservation(item.reservationRef);
      for (const reservation of reservations) {
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
    }
  }
}
