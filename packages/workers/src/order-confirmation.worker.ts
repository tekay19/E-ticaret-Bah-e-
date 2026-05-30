import type { Job } from "bullmq";
import { CustomerRepository, OrderRepository, UserRepository } from "@bahce-shop/repositories";
import { env, logger } from "@bahce-shop/shared";
import { BaseWorker, createQueue } from "./base.worker.js";
import { createEmailQueue } from "./email-sender.worker.js";

export const ORDER_CONFIRMATION_QUEUE_NAME = "order-confirmation";

type OrderConfirmationPayload = {
  orderId: string;
};

let orderConfirmationQueueSingleton: ReturnType<typeof createQueue<OrderConfirmationPayload>> | null = null;

export function createOrderConfirmationQueue() {
  if (!orderConfirmationQueueSingleton) {
    orderConfirmationQueueSingleton = createQueue<OrderConfirmationPayload>(ORDER_CONFIRMATION_QUEUE_NAME);
  }

  return orderConfirmationQueueSingleton;
}

export class OrderConfirmationWorker extends BaseWorker<OrderConfirmationPayload> {
  protected queueName = ORDER_CONFIRMATION_QUEUE_NAME;
  private readonly customers = new CustomerRepository();
  private readonly emailQueue = createEmailQueue();
  private readonly orders = new OrderRepository();
  private readonly users = new UserRepository();

  protected async handle(job: Job<OrderConfirmationPayload>) {
    const order = await this.orders.findById(job.data.orderId);
    if (!order) return { sent: false };
    const customer = await this.customers.findById(order.customerId);
    const user = customer ? await this.users.findById(customer.userId) : null;
    if (!user) return { sent: false };
    const items = await this.orders.listItems(order.id);
    await this.emailQueue.add("order-confirmation", {
      to: user.email,
      template: "order-confirmation",
      vars: {
        customerName: customer?.fullName ?? "Musterimiz",
        orderNumber: order.orderNumber,
        total: formatCents(order.totalCents),
        items: items.map((item) => `${item.quantity} x ${String(item.productSnapshot.name ?? "Urun")}`).join(", "),
        orderUrl: `${env.APP_BASE_URL}/#orders`,
      },
    });
    logger.info({ jobId: job.id, orderId: job.data.orderId }, "order confirmation email queued");
    return { sent: true };
  }
}

function formatCents(cents: number) {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(cents / 100);
}
