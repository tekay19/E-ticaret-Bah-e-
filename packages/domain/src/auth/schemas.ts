import { z } from "zod";

export const registerInputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  fullName: z.string().min(2).max(120),
  phone: z.string().min(7).max(25).optional(),
});

export const loginInputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
});

export const refreshInputSchema = z.object({
  refreshToken: z.string().min(32),
});

export const verifyEmailInputSchema = z.object({
  token: z.string().min(32),
});

export const forgotPasswordInputSchema = z.object({
  email: z.string().email(),
});

export const resetPasswordInputSchema = z.object({
  token: z.string().min(32),
  newPassword: z.string().min(8).max(128),
});

export const addressInputSchema = z.object({
  title: z.string().min(1).max(100),
  fullName: z.string().min(2).max(120),
  phone: z.string().min(7).max(25),
  city: z.string().min(2).max(80),
  district: z.string().min(2).max(80),
  postalCode: z.string().max(20).optional(),
  addressLine: z.string().min(5).max(500),
});

export const addressUpdateSchema = addressInputSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  "En az bir alan gonderilmelidir.",
);
