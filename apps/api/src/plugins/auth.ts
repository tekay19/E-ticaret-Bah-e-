import fp from "fastify-plugin";
import type { FastifyPluginAsync } from "fastify";
import { UnauthorizedError } from "@bahce-shop/shared";
import { TokenService } from "@bahce-shop/domain";

const authPlugin: FastifyPluginAsync = async (app) => {
  const tokens = new TokenService();

  app.decorateRequest("user", null);

  app.decorate("authenticate", async (request) => {
    const header = request.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      throw new UnauthorizedError();
    }

    const token = header.slice("Bearer ".length);
    try {
      request.user = await tokens.verifyAccessToken(token);
    } catch {
      throw new UnauthorizedError("Oturum süreniz doldu. Lütfen tekrar giriş yapın.");
    }
  });

  app.decorate("optionalAuthenticate", async (request) => {
    const header = request.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      request.user = null;
      return;
    }

    const token = header.slice("Bearer ".length);
    try {
      request.user = await tokens.verifyAccessToken(token);
    } catch {
      request.user = null;
    }
  });
};

export default fp(authPlugin, {
  name: "auth",
});
