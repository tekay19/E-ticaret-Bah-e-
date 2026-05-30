import fp from "fastify-plugin";
import type { FastifyPluginAsync } from "fastify";
import { ForbiddenError, UnauthorizedError, type UserRole } from "@bahce-shop/shared";

const rbacPlugin: FastifyPluginAsync = async (app) => {
  app.decorate("roleGuard", (roles: UserRole[]) => {
    return async (request) => {
      if (!request.user) {
        throw new UnauthorizedError();
      }

      if (!roles.includes(request.user.role)) {
        throw new ForbiddenError();
      }
    };
  });
};

export default fp(rbacPlugin, {
  name: "rbac",
});
