import type { FastifyPluginAsync } from "fastify";
import type { ZodType } from "zod";
import {
  OrderService,
  ShipmentService,
  createShipmentSchema,
  orderListQuerySchema,
  orderNoteSchema,
  orderTransitionSchema,
} from "@bahce-shop/domain";
import { ValidationError } from "@bahce-shop/shared";

function parseInput<T>(schema: ZodType<T>, payload: unknown): T {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues.map((issue) => issue.message).join(", "));
  }

  return parsed.data;
}

const orderRoutes: FastifyPluginAsync = async (app) => {
  const orders = new OrderService();
  const shipments = new ShipmentService();
  const adminOnly = [app.authenticate, app.roleGuard(["admin", "super_admin"])];

  app.get("/orders", { preHandler: [app.authenticate] }, async (request) => {
    return {
      data: await orders.listForUser(request.user!.id),
    };
  });

  app.get("/orders/:id", { preHandler: [app.authenticate] }, async (request) => {
    const params = request.params as { id: string };
    return {
      data: await orders.detailForUser(request.user!.id, params.id),
    };
  });

  app.get("/orders/:id/tracking", { preHandler: [app.authenticate] }, async (request) => {
    const params = request.params as { id: string };
    return {
      data: await shipments.getTrackingForUser(request.user!.id, params.id),
    };
  });

  app.post("/orders/:id/cancel", { preHandler: [app.authenticate] }, async (request) => {
    const params = request.params as { id: string };
    return orders.cancelForUser(request.user!.id, params.id);
  });

  app.get("/admin/orders", { preHandler: adminOnly }, async (request) => {
    const query = parseInput(orderListQuerySchema, request.query);
    return {
      data: await orders.listAdmin({
        status: query.status,
        customerId: query.customer,
        from: query.from,
        to: query.to,
      }),
    };
  });

  app.get("/admin/orders/:id", { preHandler: adminOnly }, async (request) => {
    const params = request.params as { id: string };
    return {
      data: await orders.detail(params.id),
    };
  });

  app.post("/admin/orders/:id/transition", { preHandler: adminOnly }, async (request) => {
    const params = request.params as { id: string };
    const input = parseInput(orderTransitionSchema, request.body);
    if (input.to === "shipped") {
      return {
        data: await shipments.createShipment(params.id, undefined, request.user!.id),
      };
    }
    return orders.transition(params.id, input.to, input.reason ?? null, request.user!.id);
  });

  app.post("/admin/orders/:id/shipments", { preHandler: adminOnly }, async (request) => {
    const params = request.params as { id: string };
    const input = parseInput(createShipmentSchema, request.body ?? {});
    return {
      data: await shipments.createShipment(params.id, input.carrierCode, request.user!.id),
    };
  });

  app.get("/admin/orders/:id/tracking", { preHandler: adminOnly }, async (request) => {
    const params = request.params as { id: string };
    return {
      data: await shipments.getTracking(params.id),
    };
  });

  app.get("/admin/orders/:id/shipping-label", { preHandler: adminOnly }, async (request, reply) => {
    const params = request.params as { id: string };
    const label = await shipments.generateLabel(params.id);
    reply
      .header("content-type", "application/pdf")
      .header("content-disposition", `attachment; filename="${label.filename}"`)
      .send(label.buffer);
  });

  app.patch("/admin/orders/:id/note", { preHandler: adminOnly }, async (request) => {
    const params = request.params as { id: string };
    const input = parseInput(orderNoteSchema, request.body);
    return orders.updateNote(params.id, input.internalNote);
  });
};

export default orderRoutes;
