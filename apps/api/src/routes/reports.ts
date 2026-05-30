import type { FastifyPluginAsync } from "fastify";
import type { ZodType } from "zod";
import { ReportService, reportQuerySchema } from "@bahce-shop/domain";
import { ValidationError } from "@bahce-shop/shared";

function parseQuery<T>(schema: ZodType<T>, payload: unknown): T {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues.map((issue) => issue.message).join(", "));
  }

  return parsed.data;
}

const reportRoutes: FastifyPluginAsync = async (app) => {
  const reports = new ReportService();
  const adminOnly = [app.authenticate, app.roleGuard(["admin", "super_admin"])];

  app.get("/admin/reports/overview", { preHandler: adminOnly }, async (request) => {
    const query = parseQuery(reportQuerySchema, request.query);
    return reports.overview(query);
  });

  app.get("/admin/reports/sales", { preHandler: adminOnly }, async (request) => {
    const query = parseQuery(reportQuerySchema, request.query);
    return reports.sales(query);
  });

  app.get("/admin/reports/inventory", { preHandler: adminOnly }, async (request) => {
    const query = parseQuery(reportQuerySchema, request.query);
    return reports.inventory(query);
  });

  app.get("/admin/reports/coupons", { preHandler: adminOnly }, async (request) => {
    const query = parseQuery(reportQuerySchema, request.query);
    return reports.coupons(query);
  });
};

export default reportRoutes;
