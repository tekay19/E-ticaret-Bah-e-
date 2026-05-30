import { z } from "zod";

export const contactMessageInputSchema = z.object({
  fullName: z.string().min(2).max(120),
  email: z.string().email(),
  phone: z.string().min(7).max(25).optional().nullable(),
  subject: z.string().min(2).max(160).optional().nullable(),
  message: z.string().min(5).max(3000),
});

export const newsletterSubscriptionInputSchema = z.object({
  email: z.string().email(),
});

export const productReviewInputSchema = z.object({
  rating: z.number().int().min(1).max(5),
  title: z.string().min(2).max(160).optional().nullable(),
  comment: z.string().min(5).max(2000),
});

export const customerProductItemInputSchema = z.object({
  productId: z.string().uuid(),
});
