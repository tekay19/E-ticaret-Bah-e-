import { z } from "zod";

export const createCouponSchema = z.object({
  code: z.string().min(2).max(80),
  name: z.string().min(2).max(160),
  description: z.string().max(1000).optional().nullable(),
  discountType: z.enum(["percent", "fixed"]),
  discountValue: z.number().int().positive(),
  maxDiscountCents: z.number().int().nonnegative().optional().nullable(),
  minSubtotalCents: z.number().int().nonnegative().optional(),
  usageLimit: z.number().int().positive().optional().nullable(),
  perCustomerLimit: z.number().int().positive().optional().nullable(),
  startsAt: z.string().datetime().optional().nullable(),
  endsAt: z.string().datetime().optional().nullable(),
  isActive: z.boolean().optional(),
});

export const updateCouponSchema = createCouponSchema.partial();

export const couponStatusSchema = z.object({
  isActive: z.boolean(),
});
