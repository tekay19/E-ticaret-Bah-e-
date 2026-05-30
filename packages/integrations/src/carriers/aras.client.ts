import { env } from "@bahce-shop/shared";
import { eventDedupeKey, makeLabelBuffer, makeTrackingNumber } from "./mock-utils.js";
import type { CreateShipmentInput, ICarrier, ShipmentEvent } from "./types.js";

export class ArasCarrier implements ICarrier {
  readonly code = "aras" as const;

  async createShipment(input: CreateShipmentInput) {
    const trackingNumber = makeTrackingNumber("AR", input.orderNumber);
    return {
      trackingNumber,
      labelUrl: `/admin/orders/${input.orderId}/shipping-label`,
      estimatedDeliveryDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    };
  }

  async getStatus(trackingNumber: string) {
    const event: ShipmentEvent = {
      trackingNumber,
      eventType: "in_transit",
      description: "Aras mock polling: kargo transfer merkezinde.",
      location: "Istanbul Transfer",
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
    const signature = headers["x-aras-signature"];
    if (env.ARAS_WEBHOOK_SECRET !== "dev" && signature !== env.ARAS_WEBHOOK_SECRET) {
      return [];
    }

    if (typeof payload === "string") {
      const trackingNumber = this.readXml(payload, "trackingNumber") ?? this.readXml(payload, "tracking_number");
      const status = this.readXml(payload, "status") as ShipmentEvent["eventType"] | null;
      if (!trackingNumber || !status) return [];
      const event: ShipmentEvent = {
        trackingNumber,
        eventType: status,
        description: this.readXml(payload, "description"),
        location: this.readXml(payload, "location"),
        occurredAt: this.readXml(payload, "occurredAt") ?? new Date().toISOString(),
        rawPayload: { xml: payload },
      };
      return [{ ...event, dedupeKey: eventDedupeKey(this.code, event) }];
    }

    const record = payload as Partial<ShipmentEvent>;
    if (!record.trackingNumber || !record.eventType) return [];
    const event: ShipmentEvent = {
      trackingNumber: record.trackingNumber,
      eventType: record.eventType,
      description: record.description ?? "Aras webhook event",
      location: record.location ?? null,
      occurredAt: record.occurredAt ?? new Date().toISOString(),
      rawPayload: payload as Record<string, unknown>,
    };
    return [{ ...event, dedupeKey: eventDedupeKey(this.code, event) }];
  }

  async generateLabel(trackingNumber: string) {
    return makeLabelBuffer("Aras Kargo", trackingNumber);
  }

  private readXml(xml: string, tag: string) {
    const match = xml.match(new RegExp(`<${tag}>(.*?)</${tag}>`, "i"));
    return match?.[1] ?? null;
  }
}
