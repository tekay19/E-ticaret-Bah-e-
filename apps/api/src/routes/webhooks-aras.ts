import type { FastifyPluginAsync } from "fastify";
import { ShipmentService } from "@bahce-shop/domain";

const arasWebhookRoutes: FastifyPluginAsync = async (app) => {
  const shipments = new ShipmentService();

  app.addContentTypeParser(["application/xml", "text/xml"], { parseAs: "string" }, (_request, body, done) => {
    done(null, body);
  });

  app.post("/webhooks/aras", async (request) => {
    return shipments.recordWebhook("aras", request.body, request.headers);
  });
};

export default arasWebhookRoutes;
