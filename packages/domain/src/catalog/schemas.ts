import { z } from "zod";

const optionalText = z.string().min(1).max(5000).optional().nullable();

export const brandInputSchema = z.object({
  name: z.string().min(2).max(120),
  slug: z.string().min(2).max(140).optional(),
  logoUrl: z.string().url().optional().nullable(),
});

export const categoryInputSchema = z.object({
  parentId: z.string().uuid().optional().nullable(),
  name: z.string().min(2).max(120),
  slug: z.string().min(2).max(140).optional(),
  description: optionalText,
  imageUrl: z.string().url().max(1000).optional().nullable(),
  metaTitle: z.string().max(160).optional().nullable(),
  metaDescription: z.string().max(320).optional().nullable(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

export const categoryUpdateSchema = categoryInputSchema
  .omit({ parentId: true })
  .partial()
  .refine((value) => Object.keys(value).length > 0, "En az bir alan gonderilmelidir.");

export const productVariantInputSchema = z.object({
  sku: z.string().min(2).max(120),
  options: z.record(z.unknown()).default({}),
  priceCents: z.number().int().nonnegative(),
  compareAtPriceCents: z.number().int().nonnegative().optional().nullable(),
  costCents: z.number().int().nonnegative().optional().nullable(),
  isActive: z.boolean().optional(),
});

export const productVariantUpdateSchema = productVariantInputSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, "En az bir alan gonderilmelidir.");

export const productInputSchema = z.object({
  sku: z.string().min(2).max(120),
  slug: z.string().min(2).max(160).optional(),
  name: z.string().min(2).max(180),
  description: optionalText,
  shortDescription: z.string().max(500).optional().nullable(),
  brandId: z.string().uuid().optional().nullable(),
  categoryId: z.string().uuid(),
  weightKg: z.string().regex(/^\d+(\.\d{1,3})?$/).optional().nullable(),
  volumeDesi: z.string().regex(/^\d+(\.\d{1,2})?$/).optional().nullable(),
  dimensionsLwh: z.record(z.unknown()).optional().nullable(),
  material: z.string().max(120).optional().nullable(),
  usageArea: z.array(z.string().min(1).max(40)).optional().nullable(),
  seasonTags: z.array(z.string().min(1).max(40)).optional().nullable(),
  isHazardous: z.boolean().optional(),
  msdsPdfUrl: z.string().url().optional().nullable(),
  warrantyMonths: z.number().int().nonnegative().optional().nullable(),
  isReturnable: z.boolean().optional(),
  returnRules: z.record(z.unknown()).optional().nullable(),
  isActive: z.boolean().optional(),
  minStockAlert: z.number().int().nonnegative().optional(),
  metaTitle: z.string().max(160).optional().nullable(),
  metaDescription: z.string().max(320).optional().nullable(),
  variants: z.array(productVariantInputSchema).min(1),
});

export const productUpdateSchema = productInputSchema
  .omit({ sku: true, variants: true })
  .partial()
  .refine((value) => Object.keys(value).length > 0, "En az bir alan gonderilmelidir.");

export const imageUploadUrlInputSchema = z.object({
  fileName: z.string().min(1).max(180),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"], {
    errorMap: () => ({ message: "Sadece PNG, JPG veya WEBP formatinda gorsel yukleyebilirsin. SVG desteklenmiyor." }),
  }),
});

export const imageConfirmInputSchema = z.object({
  productId: z.string().uuid(),
  originalKey: z.string().min(1).max(500),
  altText: z.string().max(180).optional().nullable(),
});

export const productListQuerySchema = z.object({
  category: z.string().optional(),
  brand: z.string().optional(),
  minPrice: z.coerce.number().int().nonnegative().optional(),
  maxPrice: z.coerce.number().int().nonnegative().optional(),
  sort: z.enum(["newest", "price_asc", "price_desc", "name_asc"]).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(24),
  q: z.string().min(1).optional(),
});
