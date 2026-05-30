import type { Job } from "bullmq";
import { getCarrier } from "@bahce-shop/integrations";
import {
  CustomerRepository,
  OrderRepository,
  ShipmentRepository,
} from "@bahce-shop/repositories";
import { logger } from "@bahce-shop/shared";
import { BaseWorker, createQueue } from "./base.worker.js";
import { createSmsNotificationQueue } from "./sms-notification.worker.js";

export const SHIPMENT_POLLING_QUEUE_NAME = "shipment-polling";

type ShipmentPollingPayload = {
  requestedAt: string;
};

let shipmentPollingQueueSingleton: ReturnType<typeof createQueue<ShipmentPollingPayload>> | null = null;

export function createShipmentPollingQueue() {
  if (!shipmentPollingQueueSingleton) {
    shipmentPollingQueueSingleton = createQueue<ShipmentPollingPayload>(SHIPMENT_POLLING_QUEUE_NAME);
  }

  return shipmentPollingQueueSingleton;
}

export class ShipmentPollingWorker extends BaseWorker<ShipmentPollingPayload> {
  protected queueName = SHIPMENT_POLLING_QUEUE_NAME;

  private readonly customers = new CustomerRepository();
  private readonly orders = new OrderRepository();
  private readonly shipments = new ShipmentRepository();
  private readonly smsQueue = createSmsNotificationQueue();

  protected async handle(job: Job<ShipmentPollingPayload>) {
    const active = await this.shipments.listActiveForPolling();
    let recorded = 0;

    for (const shipment of active) {
      if (!shipment.trackingNumber) continue;
      const carrier = getCarrier(shipment.carrierCode);
      const status = await carrier.getStatus(shipment.trackingNumber);

      for (const event of status.events) {
        const inserted = await this.shipments.createEvent({
          shipmentId: shipment.id,
          eventType: event.eventType,
          description: event.description ?? null,
          location: event.location ?? null,
          occurredAt: event.occurredAt,
          rawPayload: event.rawPayload ?? null,
          eventDedupeKey: event.dedupeKey ?? `${shipment.carrierCode}:${event.trackingNumber}:${event.eventType}:${event.occurredAt}`,
        });
        if (!inserted) continue;

        recorded += 1;
        await this.shipments.updateStatus({
          id: shipment.id,
          status: event.eventType,
          deliveredAt: event.eventType === "delivered" ? event.occurredAt : null,
        });

        if (event.eventType === "delivered") {
          await this.orders.markDelivered(shipment.orderId, null);
        }
        if (event.eventType === "out_for_delivery" || event.eventType === "delivered") {
          await this.enqueueSms(shipment.orderId, shipment.trackingNumber, event.eventType);
        }
      }
    }

    logger.info({ jobId: job.id, checked: active.length, recorded }, "shipment polling completed");
    return { checked: active.length, recorded };
  }

  private async enqueueSms(orderId: string, trackingNumber: string, status: "out_for_delivery" | "delivered") {
    const order = await this.orders.findById(orderId);
    const customer = order ? await this.customers.findById(order.customerId) : null;
    if (!customer?.phone) return;

    await this.smsQueue.add("shipment-sms", {
      phone: customer.phone,
      orderId,
      trackingNumber,
      status,
    });
  }
}
