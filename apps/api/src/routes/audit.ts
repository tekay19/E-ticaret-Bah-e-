import type { FastifyPluginAsync } from "fastify";
import { z, type ZodType } from "zod";
import { AuditLogRepository } from "@bahce-shop/repositories";
import { ValidationError } from "@bahce-shop/shared";

const auditQuerySchema = z.object({
  userId: z.string().uuid().optional(),
  path: z.string().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

function parseQuery<T>(schema: ZodType<T>, payload: unknown): T {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues.map((issue) => issue.message).join(", "));
  }

  return parsed.data;
}

const auditRoutes: FastifyPluginAsync = async (app) => {
  const auditLogs = new AuditLogRepository();
  const adminOnly = [app.authenticate, app.roleGuard(["admin", "super_admin"])];

  app.get("/admin/audit-logs", { preHandler: adminOnly }, async (request) => {
    const query = parseQuery(auditQuerySchema, request.query);
    return {
      data: await auditLogs.list(query),
    };
  });
};

export default auditRoutes;
