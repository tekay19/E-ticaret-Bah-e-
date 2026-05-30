import type { FastifyPluginAsync } from "fastify";
import type { ZodType } from "zod";
import {
  ReservationService,
  StockMovementService,
  completeReservationInputSchema,
  inventorySetSchema,
  movementInputSchema,
  movementListQuerySchema,
  reserveInputSchema,
} from "@bahce-shop/domain";
import { ValidationError } from "@bahce-shop/shared";
import {
  createReservationCleanupQueue,
  createStockThresholdQueue,
} from "@bahce-shop/workers";

function parseInput<T>(schema: ZodType<T>, payload: unknown): T {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues.map((issue) => issue.message).join(", "));
  }

  return parsed.data;
}

const inventoryRoutes: FastifyPluginAsync = async (app) => {
  const movements = new StockMovementService();
  const reservations = new ReservationService();
  const cleanupQueue = createReservationCleanupQueue();
  const thresholdQueue = createStockThresholdQueue();
  const adminOnly = [app.authenticate, app.roleGuard(["admin", "super_admin"])];

  app.post("/admin/inventory", { preHandler: adminOnly }, async (request) => {
    const input = parseInput(inventorySetSchema, request.body);
    return movements.setInventory(input);
  });

  app.get("/admin/inventory", { preHandler: adminOnly }, async () => {
    return {
      data: await movements.listStock(),
    };
  });

  app.post("/admin/inventory/movements", { preHandler: adminOnly }, async (request) => {
    const input = parseInput(movementInputSchema, request.body);
    return movements.record({
      ...input,
      createdBy: request.user?.id ?? null,
    });
  });

  app.get("/admin/inventory/movements", { preHandler: adminOnly }, async (request) => {
    const query = parseInput(movementListQuerySchema, request.query);
    return {
      data: await movements.listMovements(query),
    };
  });

  app.get("/admin/inventory/low-stock", { preHandler: adminOnly }, async () => {
    return {
      data: await movements.lowStock(),
    };
  });

  app.post("/admin/inventory/reservations", { preHandler: adminOnly }, async (request) => {
    const input = parseInput(reserveInputSchema, request.body);
    return reservations.reserve({
      ...input,
      reservationType: input.reservationType ?? "cart",
      ttlSeconds: input.ttlSeconds ?? 15 * 60,
    });
  });

  app.post("/admin/inventory/reservations/release", { preHandler: adminOnly }, async (request) => {
    const input = parseInput(completeReservationInputSchema, request.body);
    return reservations.release(input.referenceId);
  });

  app.post("/admin/inventory/reservations/complete", { preHandler: adminOnly }, async (request) => {
    const input = parseInput(completeReservationInputSchema, request.body);
    return reservations.completeOrderReservation(input.referenceId);
  });

  app.post("/admin/inventory/jobs/cleanup", { preHandler: adminOnly }, async () => {
    const job = await cleanupQueue.add("cleanup-expired-reservations", {
      requestedAt: new Date().toISOString(),
    });

    return {
      jobId: job.id,
      status: "queued",
    };
  });

  app.post("/admin/inventory/jobs/threshold", { preHandler: adminOnly }, async () => {
    const job = await thresholdQueue.add("check-stock-thresholds", {
      requestedAt: new Date().toISOString(),
    });

    return {
      jobId: job.id,
      status: "queued",
    };
  });
};

export default inventoryRoutes;
