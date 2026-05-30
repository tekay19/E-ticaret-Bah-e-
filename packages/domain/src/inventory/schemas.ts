import { z } from "zod";

export const inventoryUnitSchema = z.enum(["piece", "kg", "liter", "meter", "bag", "pack"]);

export const inventorySetSchema = z.object({
  variantId: z.string().uuid(),
  onHand: z.number().int().nonnegative(),
  reserved: z.number().int().nonnegative().optional(),
  unitType: inventoryUnitSchema.default("piece"),
});

export const movementInputSchema = z.object({
  variantId: z.string().uuid(),
  movementType: z.enum([
    "purchase",
    "sale",
    "return",
    "adjustment",
    "waste",
    "transfer_in",
    "transfer_out",
  ]),
  quantity: z.number().int(),
  referenceType: z.string().max(80).optional().nullable(),
  referenceId: z.string().uuid().optional().nullable(),
  reason: z.string().max(500).optional().nullable(),
});

export const movementListQuerySchema = z.object({
  variantId: z.string().uuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export const reserveInputSchema = z.object({
  variantId: z.string().uuid(),
  quantity: z.number().int().positive(),
  reservationType: z.enum(["cart", "order"]).default("cart"),
  referenceId: z.string().min(2).max(160),
  ttlSeconds: z.number().int().positive().max(24 * 60 * 60).default(15 * 60),
});

export const completeReservationInputSchema = z.object({
  referenceId: z.string().min(2).max(160),
});
