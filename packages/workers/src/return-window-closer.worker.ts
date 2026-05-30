import type { Job } from "bullmq";
import { OrderRepository } from "@bahce-shop/repositories";
import { logger } from "@bahce-shop/shared";
import { BaseWorker, createQueue } from "./base.worker.js";

export const RETURN_WINDOW_CLOSER_QUEUE_NAME = "return-window-closer";

type ReturnWindowCloserPayload = {
  requestedAt: string;
};

let returnWindowCloserQueueSingleton: ReturnType<typeof createQueue<ReturnWindowCloserPayload>> | null = null;

export function createReturnWindowCloserQueue() {
  if (!returnWindowCloserQueueSingleton) {
    returnWindowCloserQueueSingleton = createQueue<ReturnWindowCloserPayload>(RETURN_WINDOW_CLOSER_QUEUE_NAME);
  }

  return returnWindowCloserQueueSingleton;
}

export class ReturnWindowCloserWorker extends BaseWorker<ReturnWindowCloserPayload> {
  protected queueName = RETURN_WINDOW_CLOSER_QUEUE_NAME;

  private readonly orders = new OrderRepository();

  protected async handle(job: Job<ReturnWindowCloserPayload>) {
    const expired = await this.orders.listExpiredReturnWindows();
    for (const order of expired) {
      await this.orders.updateStatus(order.id, "completed", "return_window_closed", null);
    }

    logger.info({ jobId: job.id, completed: expired.length }, "return windows closed");
    return { completed: expired.length };
  }
}
