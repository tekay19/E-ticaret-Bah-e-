import { getCarrier, type ShipmentEvent } from "@bahce-shop/integrations";
import {
  CustomerRepository,
  OrderRepository,
  ShipmentRepository,
  type CarrierCode,
  type OrderStatus,
  UserRepository,
  type ShipmentRecord,
  type ShipmentStatus,
} from "@bahce-shop/repositories";
import { NotFoundError, ValidationError, env } from "@bahce-shop/shared";
import { createEmailQueue, createSmsNotificationQueue } from "@bahce-shop/workers";
import { OrderStateMachine } from "../order/order-state-machine.js";

const smsStatuses = new Set<ShipmentStatus>(["created", "out_for_delivery", "delivered"]);
type SmsShipmentStatus = "created" | "out_for_delivery" | "delivered";

function isSmsShipmentStatus(status: ShipmentStatus): status is SmsShipmentStatus {
  return smsStatuses.has(status);
}

export class ShipmentService {
  private readonly customers = new CustomerRepository();
  private readonly emailQueue = createEmailQueue();
  private readonly orders = new OrderRepository();
  private readonly shipments = new ShipmentRepository();
  private readonly smsQueue = createSmsNotificationQueue();
  private readonly users = new UserRepository();

  async createShipment(orderId: string, carrierCode?: CarrierCode, changedBy?: string | null) {
    const existing = await this.shipments.findByOrderId(orderId);
    const order = await this.orders.findById(orderId);
    if (!order) {
      throw new NotFoundError("Siparis bulunamadi.");
    }
    if (existing) {
      await this.markOrderShippedIfNeeded(order.id, order.status, changedBy ?? null);
      return existing;
    }
    if (!["paid", "preparing", "shipped"].includes(order.status)) {
      throw new ValidationError("Sadece odemesi alinmis siparisler kargoya verilebilir.");
    }

    const customer = await this.customers.findById(order.customerId);
    if (!customer) {
      throw new NotFoundError("Musteri kaydi bulunamadi.");
    }

    const items = await this.orders.listItems(orderId);
    const resolvedCarrier = carrierCode ?? (order.carrierCode as CarrierCode);
    const carrier = getCarrier(resolvedCarrier);
    const created = await carrier.createShipment({
      orderId,
      orderNumber: order.orderNumber,
      carrierCode: resolvedCarrier,
      recipientName: customer.fullName,
      recipientPhone: customer.phone,
      shippingAddress: order.shippingAddress,
      items: items.map((item) => ({
        sku: String(item.variantSnapshot.sku ?? ""),
        name: String(item.productSnapshot.name ?? ""),
        quantity: item.quantity,
      })),
    });

    const shipment = await this.shipments.create({
      orderId,
      carrierCode: resolvedCarrier,
      trackingNumber: created.trackingNumber,
      labelUrl: created.labelUrl,
      estimatedDeliveryDate: created.estimatedDeliveryDate ?? null,
      status: "created",
    });

    await this.markOrderShippedIfNeeded(order.id, order.status, changedBy ?? null);

    await this.recordEvent(shipment, {
      trackingNumber: shipment.trackingNumber!,
      eventType: "created",
      description: "Kargo kaydi olusturuldu.",
      occurredAt: new Date().toISOString(),
      rawPayload: { source: "shipment_service" },
      dedupeKey: `${shipment.carrierCode}:${shipment.trackingNumber}:created`,
    });
    await this.enqueueShipmentEmail(order.id, shipment.carrierCode, shipment.trackingNumber ?? "-");

    return shipment;
  }

  private async markOrderShippedIfNeeded(orderId: string, status: OrderStatus, changedBy: string | null) {
    if (status === "paid") {
      OrderStateMachine.assertTransition("paid", "preparing");
      await this.orders.updateStatus(orderId, "preparing", "shipment_created", changedBy);
      OrderStateMachine.assertTransition("preparing", "shipped");
      await this.orders.updateStatus(orderId, "shipped", "shipment_created", changedBy);
      return;
    }
    if (status === "preparing") {
      OrderStateMachine.assertTransition("preparing", "shipped");
      await this.orders.updateStatus(orderId, "shipped", "shipment_created", changedBy);
    }
  }

  async getTrackingForUser(userId: string, orderId: string) {
    const customer = await this.customers.findByUserId(userId);
    if (!customer) {
      throw new NotFoundError("Musteri kaydi bulunamadi.");
    }
    const order = await this.orders.findById(orderId);
    if (!order || order.customerId !== customer.id) {
      throw new NotFoundError("Siparis bulunamadi.");
    }

    return this.getTracking(orderId);
  }

  async getTracking(orderId: string) {
    const shipment = await this.shipments.findByOrderId(orderId);
    if (!shipment) {
      throw new NotFoundError("Kargo kaydi bulunamadi.");
    }
    const events = await this.shipments.listEvents(shipment.id);
    return {
      shipment,
      latestEvent: events[0] ?? null,
      events,
    };
  }

  async generateLabel(orderId: string) {
    const shipment = await this.shipments.findByOrderId(orderId);
    if (!shipment?.trackingNumber) {
      throw new NotFoundError("Kargo etiketi bulunamadi.");
    }

    const carrier = getCarrier(shipment.carrierCode);
    return {
      filename: `${shipment.carrierCode}-${shipment.trackingNumber}.pdf`,
      buffer: await carrier.generateLabel(shipment.trackingNumber),
    };
  }

  async recordWebhook(carrierCode: CarrierCode, payload: unknown, headers: Record<string, string | string[] | undefined>) {
    const carrier = getCarrier(carrierCode);
    const events = carrier.parseWebhook(payload, headers);
    let recorded = 0;

    for (const event of events) {
      const shipment = await this.shipments.findByTrackingNumber(event.trackingNumber);
      if (!shipment) continue;
      const inserted = await this.recordEvent(shipment, event);
      if (inserted) recorded += 1;
    }

    return { received: true, recorded };
  }

  async pollActiveShipments() {
    const active = await this.shipments.listActiveForPolling();
    let recorded = 0;

    for (const shipment of active) {
      if (!shipment.trackingNumber) continue;
      const carrier = getCarrier(shipment.carrierCode);
      const status = await carrier.getStatus(shipment.trackingNumber);
      for (const event of status.events) {
        const inserted = await this.recordEvent(shipment, event);
        if (inserted) recorded += 1;
      }
    }

    return { checked: active.length, recorded };
  }

  private async recordEvent(shipment: ShipmentRecord, event: ShipmentEvent) {
    const inserted = await this.shipments.createEvent({
      shipmentId: shipment.id,
      eventType: event.eventType,
      description: event.description ?? null,
      location: event.location ?? null,
      occurredAt: event.occurredAt,
      rawPayload: event.rawPayload ?? null,
      eventDedupeKey: event.dedupeKey ?? `${shipment.carrierCode}:${event.trackingNumber}:${event.eventType}:${event.occurredAt}`,
    });

    if (!inserted) return null;

    const deliveredAt = event.eventType === "delivered" ? event.occurredAt : null;
    await this.shipments.updateStatus({
      id: shipment.id,
      status: event.eventType,
      deliveredAt,
    });

    if (event.eventType === "delivered") {
      await this.orders.markDelivered(shipment.orderId, null);
    }

    if (isSmsShipmentStatus(event.eventType)) {
      const order = await this.orders.findById(shipment.orderId);
      const customer = order ? await this.customers.findById(order.customerId) : null;
      if (customer?.phone) {
        await this.smsQueue.add("shipment-sms", {
          phone: customer.phone,
          orderId: shipment.orderId,
          trackingNumber: event.trackingNumber,
          status: event.eventType,
        });
      }
    }

    return inserted;
  }

  private async enqueueShipmentEmail(orderId: string, carrier: string, trackingNumber: string) {
    const order = await this.orders.findById(orderId);
    const customer = order ? await this.customers.findById(order.customerId) : null;
    const user = customer ? await this.users.findById(customer.userId) : null;
    if (!order || !customer || !user) return;
    await this.emailQueue.add("shipment-created", {
      to: user.email,
      template: "shipment-created",
      vars: {
        customerName: customer.fullName,
        orderNumber: order.orderNumber,
        carrier,
        trackingNumber,
        orderUrl: `${env.APP_BASE_URL}/#orders`,
      },
    });
  }
}
