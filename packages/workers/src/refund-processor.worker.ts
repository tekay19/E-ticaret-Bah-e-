import type { Job } from "bullmq";
import { IyzicoClient } from "@bahce-shop/integrations";
import { CustomerRepository, ReturnRepository, UserRepository } from "@bahce-shop/repositories";
import { env, logger } from "@bahce-shop/shared";
import { BaseWorker, createQueue } from "./base.worker.js";
import { createEmailQueue } from "./email-sender.worker.js";

export const REFUND_PROCESSOR_QUEUE_NAME = "refund-processor";

type RefundProcessorPayload = {
  refundId?: string;
};

let refundProcessorQueueSingleton: ReturnType<typeof createQueue<RefundProcessorPayload>> | null = null;

export function createRefundProcessorQueue() {
  if (!refundProcessorQueueSingleton) {
    refundProcessorQueueSingleton = createQueue<RefundProcessorPayload>(REFUND_PROCESSOR_QUEUE_NAME);
  }

  return refundProcessorQueueSingleton;
}

export class RefundProcessorWorker extends BaseWorker<RefundProcessorPayload> {
  protected queueName = REFUND_PROCESSOR_QUEUE_NAME;

  private readonly customers = new CustomerRepository();
  private readonly emailQueue = createEmailQueue();
  private readonly iyzico = new IyzicoClient();
  private readonly returns = new ReturnRepository();
  private readonly users = new UserRepository();

  protected async handle(job: Job<RefundProcessorPayload>) {
    const pending = await this.returns.listPendingRefunds();
    let succeeded = 0;
    let failed = 0;

    for (const refund of pending) {
      if (job.data.refundId && refund.id !== job.data.refundId) continue;

      try {
        await this.returns.markRefundProcessing(refund.id);
        const result = await this.iyzico.refund(
          {
            paymentTransactionId: refund.paymentProviderTransactionId ?? refund.paymentId,
            amountCents: refund.amountCents,
          },
          refund.id,
        );
        await this.returns.markRefundSucceeded(refund.id, `mock-refund-${refund.id}`);
        if (refund.returnId) {
          await this.returns.updateStatus(refund.returnId, "refunded", "refund_succeeded", null);
          await this.enqueueRefundEmail(refund.returnId, refund.amountCents);
        }
        logger.info({ jobId: job.id, refundId: refund.id, result }, "refund processed");
        succeeded += 1;
      } catch (error) {
        failed += 1;
        await this.returns.markRefundFailed(
          refund.id,
          error instanceof Error ? error.message : "unknown_error",
        );
      }
    }

    return { checked: pending.length, succeeded, failed };
  }

  private async enqueueRefundEmail(returnId: string, amountCents: number) {
    const record = await this.returns.findById(returnId);
    const customer = record ? await this.customers.findById(record.customerId) : null;
    const user = customer ? await this.users.findById(customer.userId) : null;
    if (!record || !customer || !user) return;
    await this.emailQueue.add("refund-completed", {
      to: user.email,
      template: "refund-completed",
      vars: {
        customerName: customer.fullName,
        returnNumber: record.returnNumber,
        amount: new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(amountCents / 100),
        returnUrl: `${env.APP_BASE_URL}/#returns`,
      },
    });
  }
}
