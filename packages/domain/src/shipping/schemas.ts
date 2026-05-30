import { z } from "zod";

export const carrierCodeSchema = z.enum(["aras", "mng", "yurtici"]);

export const createShipmentSchema = z.object({
  carrierCode: carrierCodeSchema.optional(),
});

export const shipmentWebhookSchema = z.object({
  trackingNumber: z.string().min(3),
  eventType: z.enum(["created", "picked_up", "in_transit", "out_for_delivery", "delivered", "failed", "returned"]),
  description: z.string().max(500).optional().nullable(),
  location: z.string().max(120).optional().nullable(),
  occurredAt: z.string().datetime().optional(),
});
