import type { CarrierCode, ShipmentStatus } from "@bahce-shop/repositories";

export type CreateShipmentInput = {
  orderId: string;
  orderNumber: string;
  carrierCode: CarrierCode;
  recipientName: string;
  recipientPhone?: string | null;
  shippingAddress: Record<string, unknown>;
  items: Array<{
    sku?: string | null;
    name?: string | null;
    quantity: number;
  }>;
};

export type ShipmentEvent = {
  trackingNumber: string;
  eventType: ShipmentStatus;
  description?: string | null;
  location?: string | null;
  occurredAt: string;
  rawPayload?: Record<string, unknown> | null;
  dedupeKey?: string | null;
};

export type ShipmentStatusResponse = {
  trackingNumber: string;
  status: ShipmentStatus;
  estimatedDeliveryDate?: string | null;
  events: ShipmentEvent[];
};

export interface ICarrier {
  readonly code: CarrierCode;
  createShipment(input: CreateShipmentInput): Promise<{
    trackingNumber: string;
    labelUrl: string;
    estimatedDeliveryDate?: string | null;
  }>;
  getStatus(trackingNumber: string): Promise<ShipmentStatusResponse>;
  parseWebhook(payload: unknown, headers: Record<string, string | string[] | undefined>): ShipmentEvent[];
  generateLabel(trackingNumber: string): Promise<Buffer>;
}
