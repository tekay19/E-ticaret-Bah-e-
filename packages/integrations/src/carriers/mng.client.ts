import { env } from "@bahce-shop/shared";
import { eventDedupeKey, makeLabelBuffer, makeTrackingNumber } from "./mock-utils.js";
import type { CreateShipmentInput, ICarrier, ShipmentEvent } from "./types.js";

export class MngCarrier implements ICarrier {
  readonly code = "mng" as const;

  async createShipment(input: CreateShipmentInput) {
    const trackingNumber = makeTrackingNumber("MNG", input.orderNumber);
    return {
      trackingNumber,
      labelUrl: `/admin/orders/${input.orderId}/shipping-label`,
      estimatedDeliveryDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    };
  }

  async getStatus(trackingNumber: string) {
    const event: ShipmentEvent = {
      trackingNumber,
      eventType: "in_transit",
      description: "MNG mock polling: kargo yolda.",
      location: "Istanbul Aktarma",
      occurredAt: new Date().toISOString(),
      rawPayload: { mode: "mock", carrier: this.code, trackingNumber },
    };

    return {
      trackingNumber,
      status: event.eventType,
      events: [{ ...event, dedupeKey: eventDedupeKey(this.code, event) }],
    };
  }

  parseWebhook(payload: unknown, headers: Record<string, string | string[] | undefined>) {
    const signature = headers["x-mng-signature"];
    if (env.MNG_WEBHOOK_SECRET !== "dev" && signature !== env.MNG_WEBHOOK_SECRET) {
      return [];
    }

    const record = payload as Partial<ShipmentEvent>;
    if (!record.trackingNumber || !record.eventType) return [];

    const event: ShipmentEvent = {
      trackingNumber: record.trackingNumber,
      eventType: record.eventType,
      description: record.description ?? "MNG webhook event",
      location: record.location ?? null,
      occurredAt: record.occurredAt ?? new Date().toISOString(),
      rawPayload: payload as Record<string, unknown>,
    };
    return [{ ...event, dedupeKey: eventDedupeKey(this.code, event) }];
  }

  async generateLabel(trackingNumber: string) {
    return makeLabelBuffer("MNG Kargo", trackingNumber);
  }
}
