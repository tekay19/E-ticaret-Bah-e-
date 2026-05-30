import fp from "fastify-plugin";
import type { FastifyPluginAsync } from "fastify";
import { AuditLogRepository } from "@bahce-shop/repositories";

const auditLogPlugin: FastifyPluginAsync = async (app) => {
  const auditLogs = new AuditLogRepository();

  app.addHook("onResponse", async (request, reply) => {
    const path = request.url.split("?")[0];
    if (!path.startsWith("/admin")) {
      return;
    }

    try {
      await auditLogs.create({
        userId: request.user?.id ?? null,
        userRole: request.user?.role ?? null,
        method: request.method,
        path,
        statusCode: reply.statusCode,
        requestId: reply.getHeader("x-request-id")?.toString() ?? null,
        ip: request.ip,
        userAgent: request.headers["user-agent"]?.toString() ?? null,
        metadata: {
          query: request.query,
        },
      });
    } catch (error) {
      request.log.warn({ err: error }, "audit log write failed");
    }
  });
};

export default fp(auditLogPlugin, {
  name: "audit-log",
});
