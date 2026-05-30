import { z } from "zod";

export const returnReasonSchema = z.enum([
  "cayma_hakki",
  "hasarli_kargo",
  "yanlis_urun",
  "defolu_urun",
  "aciklamayla_uyumsuz",
]);

export const createReturnSchema = z.object({
  orderId: z.string().uuid(),
  reason: returnReasonSchema,
  customerNote: z.string().max(1000).optional().nullable(),
  photos: z.array(z.string().url()).optional().nullable(),
  items: z.array(z.object({
    orderItemId: z.string().uuid(),
    quantity: z.number().int().positive(),
  })).min(1),
});

export const returnListQuerySchema = z.object({
  status: z.enum(["requested", "approved", "rejected", "in_transit", "received", "refunded", "cancelled"]).optional(),
});

export const rejectReturnSchema = z.object({
  rejectedReason: z.string().min(3).max(1000),
});

export const approveReturnSchema = z.object({
  adminNote: z.string().max(1000).optional().nullable(),
});

export const receiveReturnSchema = z.object({
  items: z.array(z.object({
    returnItemId: z.string().uuid(),
    itemCondition: z.enum(["unopened", "opened", "damaged", "missing"]),
    restockEligible: z.boolean().optional(),
  })).min(1),
});
