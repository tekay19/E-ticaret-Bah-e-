import type { Job } from "bullmq";
import { OrderRepository } from "@bahce-shop/repositories";
import { logger } from "@bahce-shop/shared";
import { BaseWorker, createQueue } from "./base.worker.js";

export const EFATURA_QUEUE_NAME = "efatura";

type EfaturaPayload = {
  orderId: string;
};

let efaturaQueueSingleton: ReturnType<typeof createQueue<EfaturaPayload>> | null = null;

export function createEfaturaQueue() {
  if (!efaturaQueueSingleton) {
    efaturaQueueSingleton = createQueue<EfaturaPayload>(EFATURA_QUEUE_NAME);
  }

  return efaturaQueueSingleton;
}

export class EfaturaWorker extends BaseWorker<EfaturaPayload> {
  protected queueName = EFATURA_QUEUE_NAME;

  protected async handle(job: Job<EfaturaPayload>) {
    logger.info({ jobId: job.id, orderId: job.data.orderId }, "efatura integration placeholder executed");
    return { invoicePdfUrl: null };
  }
}
