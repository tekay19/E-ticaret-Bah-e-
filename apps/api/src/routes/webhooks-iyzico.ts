import { randomUUID } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import { IyzicoClient } from "@bahce-shop/integrations";
import { OrderRepository } from "@bahce-shop/repositories";
import { ValidationError } from "@bahce-shop/shared";

const iyzicoWebhookRoutes: FastifyPluginAsync = async (app) => {
  const iyzico = new IyzicoClient();
  const orders = new OrderRepository();

  app.post("/webhooks/iyzico", async (request) => {
    const rawPayload = JSON.stringify(request.body ?? {});
    const signature = request.headers["x-iyzico-signature"]?.toString() ?? "";
    if (!iyzico.verifyWebhookSignature(rawPayload, signature)) {
      throw new ValidationError("Webhook imzasi gecersiz.");
    }

    const payload = request.body as { eventId?: string; eventType?: string; token?: string };
    const eventId = payload.eventId ?? randomUUID();
    const isNew = await orders.recordWebhook(
      eventId,
      "iyzico",
      payload.eventType ?? "payment.updated",
      payload as Record<string, unknown>,
    );

    return {
      received: true,
      duplicate: !isNew,
    };
  });
};

export default iyzicoWebhookRoutes;
