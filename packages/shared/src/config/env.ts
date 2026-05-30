import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { config } from "dotenv";
import { z } from "zod";

let envDir = process.cwd();
for (let depth = 0; depth < 5; depth += 1) {
  const envPath = join(envDir, ".env");
  if (existsSync(envPath)) {
    config({ path: envPath });
    break;
  }
  envDir = dirname(envDir);
}

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]),
  PORT: z.coerce.number().default(3000),
  APP_VERSION: z.string().default("0.1.0"),
  APP_BASE_URL: z.string().url().default("http://localhost:3000"),
  WEB_BASE_URL: z.string().url().default("http://localhost:5173"),
  COOKIE_SECRET: z.string().min(16).default("dev_cookie_secret_change_me"),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_PRIVATE_KEY: z.string(),
  JWT_PUBLIC_KEY: z.string(),
  JWT_ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(15),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  S3_ENDPOINT: z.string().url(),
  S3_PUBLIC_BASE_URL: z.string().url().optional(),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().positive().default(1025),
  SMTP_USER: z.string().optional().default(""),
  SMTP_PASS: z.string().optional().default(""),
  SMTP_FROM: z.string().email(),
  IYZICO_API_KEY: z.string().optional().default("sandbox-api-key"),
  IYZICO_SECRET_KEY: z.string().optional().default("sandbox-secret"),
  IYZICO_BASE_URL: z.string().url().optional().default("https://sandbox-api.iyzipay.com"),
  ARAS_API_USERNAME: z.string().optional().default("aras-user"),
  ARAS_API_PASSWORD: z.string().optional().default("aras-pass"),
  ARAS_WEBHOOK_SECRET: z.string().optional().default("dev"),
  MNG_API_KEY: z.string().optional().default("mng-api-key"),
  MNG_WEBHOOK_SECRET: z.string().optional().default("dev"),
  SMS_PROVIDER: z.enum(["mock", "netgsm", "iletimerkezi"]).optional().default("mock"),
  SMS_API_KEY: z.string().optional().default("sms-api-key"),
  SMS_API_SECRET: z.string().optional().default("sms-api-secret"),
});

export const env = envSchema.parse(process.env);
