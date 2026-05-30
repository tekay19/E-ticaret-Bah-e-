import type { FastifyPluginAsync } from "fastify";
import type { ZodType } from "zod";
import {
  ReturnService,
  approveReturnSchema,
  createReturnSchema,
  receiveReturnSchema,
  rejectReturnSchema,
  returnListQuerySchema,
} from "@bahce-shop/domain";
import { ValidationError } from "@bahce-shop/shared";

function parseInput<T>(schema: ZodType<T>, payload: unknown): T {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues.map((issue) => issue.message).join(", "));
  }

  return parsed.data;
}

const returnRoutes: FastifyPluginAsync = async (app) => {
  const returns = new ReturnService();
  const adminOnly = [app.authenticate, app.roleGuard(["admin", "super_admin"])];

  app.get("/returns", { preHandler: [app.authenticate] }, async (request) => {
    const query = parseInput(returnListQuerySchema, request.query);
    return {
      data: await returns.listForUser(request.user!.id, query.status),
    };
  });

  app.get("/returns/:id", { preHandler: [app.authenticate] }, async (request) => {
    const params = request.params as { id: string };
    return {
      data: await returns.detailForUser(request.user!.id, params.id),
    };
  });

  app.post("/returns", { preHandler: [app.authenticate] }, async (request) => {
    const input = parseInput(createReturnSchema, request.body);
    return {
      data: await returns.createForUser({
        userId: request.user!.id,
        ...input,
      }),
    };
  });

  app.post("/returns/:id/cancel", { preHandler: [app.authenticate] }, async (request) => {
    const params = request.params as { id: string };
    return {
      data: await returns.cancelForUser(request.user!.id, params.id),
    };
  });

  app.get("/admin/returns", { preHandler: adminOnly }, async (request) => {
    const query = parseInput(returnListQuerySchema, request.query);
    return {
      data: await returns.listAdmin(query.status),
    };
  });

  app.get("/admin/returns/:id", { preHandler: adminOnly }, async (request) => {
    const params = request.params as { id: string };
    return {
      data: await returns.detailForAdmin(params.id),
    };
  });

  app.post("/admin/returns/:id/approve", { preHandler: adminOnly }, async (request) => {
    const params = request.params as { id: string };
    const input = parseInput(approveReturnSchema, request.body ?? {});
    return {
      data: await returns.approve(params.id, request.user!.id, input.adminNote ?? null),
    };
  });

  app.post("/admin/returns/:id/reject", { preHandler: adminOnly }, async (request) => {
    const params = request.params as { id: string };
    const input = parseInput(rejectReturnSchema, request.body);
    return {
      data: await returns.reject(params.id, request.user!.id, input.rejectedReason),
    };
  });

  app.post("/admin/returns/:id/receive", { preHandler: adminOnly }, async (request) => {
    const params = request.params as { id: string };
    const input = parseInput(receiveReturnSchema, request.body);
    return {
      data: await returns.receive(params.id, request.user!.id, input.items),
    };
  });
};

export default returnRoutes;
