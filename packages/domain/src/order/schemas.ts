import { z } from "zod";

export const checkoutInitiateSchema = z.object({
  cartId: z.string().uuid().optional(),
  shippingAddress: z.record(z.unknown()).default({}),
  billingAddress: z.record(z.unknown()).optional().nullable(),
  carrierCode: z.string().min(2).max(40).default("aras"),
  shippingCents: z.number().int().nonnegative().default(0),
  customerNote: z.string().max(1000).optional().nullable(),
});

export const checkoutConfirmSchema = z.object({
  token: z.string().min(4),
});

export const orderTransitionSchema = z.object({
  to: z.enum(["paid", "preparing", "shipped", "delivered", "completed", "cancelled"]),
  reason: z.string().max(500).optional().nullable(),
});

export const orderNoteSchema = z.object({
  internalNote: z.string().max(2000),
});

export const orderListQuerySchema = z.object({
  status: z.enum(["pending_payment", "paid", "preparing", "shipped", "delivered", "completed", "cancelled"]).optional(),
  customer: z.string().uuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});
