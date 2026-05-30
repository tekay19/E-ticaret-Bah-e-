import type { FastifyPluginAsync } from "fastify";
import type { ZodType } from "zod";
import { CouponService, couponStatusSchema, createCouponSchema, updateCouponSchema } from "@bahce-shop/domain";
import { ValidationError } from "@bahce-shop/shared";

function parseInput<T>(schema: ZodType<T>, payload: unknown): T {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues.map((issue) => issue.message).join(", "));
  }

  return parsed.data;
}

const couponRoutes: FastifyPluginAsync = async (app) => {
  const coupons = new CouponService();
  const adminOnly = [app.authenticate, app.roleGuard(["admin", "super_admin"])];

  app.get("/admin/coupons", { preHandler: adminOnly }, async () => {
    return {
      data: await coupons.list(),
    };
  });

  app.get<{ Params: { id: string } }>("/admin/coupons/:id", { preHandler: adminOnly }, async (request) => {
    return {
      data: await coupons.get(request.params.id),
    };
  });

  app.post("/admin/coupons", { preHandler: adminOnly }, async (request) => {
    const input = parseInput(createCouponSchema, request.body);
    return {
      data: await coupons.create(input),
    };
  });

  app.patch<{ Params: { id: string } }>("/admin/coupons/:id", { preHandler: adminOnly }, async (request) => {
    const input = parseInput(updateCouponSchema, request.body);
    return {
      data: await coupons.update(request.params.id, input),
    };
  });

  app.patch<{ Params: { id: string } }>("/admin/coupons/:id/status", { preHandler: adminOnly }, async (request) => {
    const input = parseInput(couponStatusSchema, request.body);
    return {
      data: await coupons.setActive(request.params.id, input.isActive),
    };
  });

  app.delete<{ Params: { id: string } }>("/admin/coupons/:id", { preHandler: adminOnly }, async (request) => {
    return {
      data: await coupons.delete(request.params.id),
    };
  });
};

export default couponRoutes;
