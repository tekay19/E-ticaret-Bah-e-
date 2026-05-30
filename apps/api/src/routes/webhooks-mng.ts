import type { FastifyPluginAsync } from "fastify";
import { ShipmentService } from "@bahce-shop/domain";

const mngWebhookRoutes: FastifyPluginAsync = async (app) => {
  const shipments = new ShipmentService();

  app.post("/webhooks/mng", async (request) => {
    return shipments.recordWebhook("mng", request.body, request.headers);
  });
};

export default mngWebhookRoutes;
