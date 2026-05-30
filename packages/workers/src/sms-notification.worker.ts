import type { Job } from "bullmq";
import { logger } from "@bahce-shop/shared";
import { BaseWorker, createQueue } from "./base.worker.js";

export const SMS_NOTIFICATION_QUEUE_NAME = "sms-notification";

export type SmsNotificationPayload = {
  phone: string;
  orderId: string;
  trackingNumber: string;
  status: "created" | "out_for_delivery" | "delivered";
};

let smsQueueSingleton: ReturnType<typeof createQueue<SmsNotificationPayload>> | null = null;

export function createSmsNotificationQueue() {
  if (!smsQueueSingleton) {
    smsQueueSingleton = createQueue<SmsNotificationPayload>(SMS_NOTIFICATION_QUEUE_NAME);
  }

  return smsQueueSingleton;
}

export class SmsNotificationWorker extends BaseWorker<SmsNotificationPayload> {
  protected queueName = SMS_NOTIFICATION_QUEUE_NAME;

  protected async handle(job: Job<SmsNotificationPayload>) {
    const message = this.messageFor(job.data);
    logger.info(
      {
        jobId: job.id,
        phone: job.data.phone,
        orderId: job.data.orderId,
        trackingNumber: job.data.trackingNumber,
        message,
      },
      "sms notification mock sent",
    );
    return { sent: true, provider: "mock", message };
  }

  private messageFor(payload: SmsNotificationPayload) {
    if (payload.status === "out_for_delivery") {
      return "Siparisiniz dagitimda.";
    }
    if (payload.status === "delivered") {
      return "Siparisiniz teslim edildi.";
    }
    return `Siparisiniz kargoya verildi. Takip: ${payload.trackingNumber}`;
  }
}
