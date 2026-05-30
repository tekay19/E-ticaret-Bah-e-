import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Handlebars from "handlebars";
import type { Job } from "bullmq";
import nodemailer from "nodemailer";
import { env, logger } from "@bahce-shop/shared";
import { BaseWorker, createQueue } from "./base.worker.js";

export const EMAIL_QUEUE_NAME = "email";

export type EmailJobPayload = {
  to: string;
  template:
    | "verify-email"
    | "reset-password"
    | "order-confirmation"
    | "order-status-updated"
    | "shipment-created"
    | "return-status-updated"
    | "refund-completed";
  vars: Record<string, string>;
};

const __dirname = dirname(fileURLToPath(import.meta.url));
let emailQueueSingleton: ReturnType<typeof createQueue<EmailJobPayload>> | null = null;

async function renderTemplate(template: EmailJobPayload["template"], vars: Record<string, string>) {
  const templatePath = join(__dirname, "templates", `${template}.hbs`);
  const source = await readFile(templatePath, "utf8");
  return Handlebars.compile(source)(vars);
}

function buildTransport() {
  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: false,
    auth: env.SMTP_USER
      ? {
          user: env.SMTP_USER,
          pass: env.SMTP_PASS,
        }
      : undefined,
  });
}

export function createEmailQueue() {
  if (!emailQueueSingleton) {
    emailQueueSingleton = createQueue<EmailJobPayload>(EMAIL_QUEUE_NAME);
  }

  return emailQueueSingleton;
}

export class EmailSenderWorker extends BaseWorker<EmailJobPayload> {
  protected queueName = EMAIL_QUEUE_NAME;

  protected async handle(job: Job<EmailJobPayload>) {
    const transporter = buildTransport();
    const html = await renderTemplate(job.data.template, job.data.vars);
    const subjects: Record<EmailJobPayload["template"], string> = {
      "verify-email": "Email adresinizi dogrulayin",
      "reset-password": "Sifre sifirlama talebi",
      "order-confirmation": "Siparisiniz alindi",
      "order-status-updated": "Siparis durumunuz guncellendi",
      "shipment-created": "Siparisiniz kargoya verildi",
      "return-status-updated": "Iade talebiniz guncellendi",
      "refund-completed": "Odeme iadeniz tamamlandi",
    };

    await transporter.sendMail({
      from: env.SMTP_FROM,
      to: job.data.to,
      subject: subjects[job.data.template],
      html,
    });

    logger.info({ jobId: job.id, to: job.data.to }, "email sent");
  }
}
