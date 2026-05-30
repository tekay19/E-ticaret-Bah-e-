import { z } from "zod";

export const addCartItemSchema = z.object({
  variantId: z.string().uuid(),
  qty: z.number().int().positive(),
});

export const updateCartItemSchema = z.object({
  qty: z.number().int().min(0),
});

export const couponSchema = z.object({
  code: z.string().min(2).max(80),
});

export const shippingOptionsSchema = z.object({
  addressId: z.string().uuid().optional(),
  deliveryCity: z.string().min(2).max(80).optional(),
});
