import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import {
  AddressService,
  AuthService,
  addressInputSchema,
  addressUpdateSchema,
  forgotPasswordInputSchema,
  loginInputSchema,
  refreshInputSchema,
  registerInputSchema,
  resetPasswordInputSchema,
  verifyEmailInputSchema,
} from "@bahce-shop/domain";
import { UnauthorizedError, ValidationError, env } from "@bahce-shop/shared";
import type { ZodType } from "zod";

const REFRESH_COOKIE_NAME = "bahce_refresh_token";

function parseBody<T>(schema: ZodType<T>, payload: unknown): T {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues.map((issue) => issue.message).join(", "));
  }

  return parsed.data;
}

function getRefreshToken(request: FastifyRequest, required = true) {
  const body = request.body as { refreshToken?: unknown } | undefined;
  const candidate = typeof body?.refreshToken === "string"
    ? body.refreshToken
    : request.cookies[REFRESH_COOKIE_NAME];

  if (!candidate && required) {
    throw new UnauthorizedError("Oturum yenileme token'i bulunamadi.");
  }

  if (!candidate) return null;

  return parseBody(refreshInputSchema, { refreshToken: candidate }).refreshToken;
}

function setRefreshCookie(reply: FastifyReply, refreshToken: string) {
  reply.setCookie(REFRESH_COOKIE_NAME, refreshToken, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60,
  });
}

function clearRefreshCookie(reply: FastifyReply) {
  reply.clearCookie(REFRESH_COOKIE_NAME, {
    path: "/",
  });
}

const authRoutes: FastifyPluginAsync = async (app) => {
  const authService = new AuthService();
  const addressService = new AddressService();
  const relaxedAuthLimits = env.NODE_ENV !== "production";

  app.post(
    "/auth/register",
    {
      config: {
        rateLimit: {
          max: relaxedAuthLimits ? 100 : 3,
          timeWindow: relaxedAuthLimits ? "1 minute" : "1 hour",
        },
      },
    },
    async (request) => {
      const input = parseBody(registerInputSchema, request.body);
      return authService.register(input);
    },
  );

  app.post(
    "/auth/login",
    {
      config: {
        rateLimit: {
          max: relaxedAuthLimits ? 100 : 5,
          timeWindow: relaxedAuthLimits ? "1 minute" : "15 minutes",
        },
      },
    },
    async (request, reply) => {
      const input = parseBody(loginInputSchema, request.body);
      const result = await authService.login(input);
      setRefreshCookie(reply, result.refreshToken);
      return {
        user: result.user,
        accessToken: result.accessToken,
      };
    },
  );

  app.post(
    "/auth/refresh",
    {
      config: {
        rateLimit: {
          max: relaxedAuthLimits ? 120 : 30,
          timeWindow: relaxedAuthLimits ? "1 minute" : "15 minutes",
        },
      },
    },
    async (request, reply) => {
      const refreshToken = getRefreshToken(request);
      const result = await authService.refresh(refreshToken!);
      setRefreshCookie(reply, result.refreshToken);
      return {
        user: result.user,
        accessToken: result.accessToken,
      };
    },
  );

  app.post("/auth/logout", async (request, reply) => {
    const refreshToken = getRefreshToken(request, false);
    if (refreshToken) {
      await authService.logout(refreshToken);
    }
    clearRefreshCookie(reply);
    return { success: true };
  });

  app.get("/auth/me", { preHandler: [app.authenticate] }, async (request) => {
    return {
      user: request.user,
    };
  });

  app.get("/auth/verify-email", async (request) => {
    const token = (request.query as { token?: string }).token;
    const input = parseBody(verifyEmailInputSchema, { token });
    return authService.verifyEmail(input.token);
  });

  app.post("/auth/verify-email", async (request) => {
    const input = parseBody(verifyEmailInputSchema, request.body);
    return authService.verifyEmail(input.token);
  });

  app.post(
    "/auth/forgot-password",
    {
      config: {
        rateLimit: {
          max: relaxedAuthLimits ? 100 : 3,
          timeWindow: relaxedAuthLimits ? "1 minute" : "1 hour",
        },
      },
    },
    async (request) => {
      const input = parseBody(forgotPasswordInputSchema, request.body);
      return authService.forgotPassword(input.email);
    },
  );

  app.post(
    "/auth/reset-password",
    {
      config: {
        rateLimit: {
          max: relaxedAuthLimits ? 100 : 5,
          timeWindow: relaxedAuthLimits ? "1 minute" : "15 minutes",
        },
      },
    },
    async (request) => {
      const input = parseBody(resetPasswordInputSchema, request.body);
      return authService.resetPassword(input.token, input.newPassword);
    },
  );

  app.get("/addresses", { preHandler: [app.authenticate] }, async (request) => {
    return addressService.listForUser(request.user!.id);
  });

  app.post("/addresses", { preHandler: [app.authenticate] }, async (request) => {
    const input = parseBody(addressInputSchema, request.body);
    return addressService.createForUser(request.user!.id, input);
  });

  app.patch(
    "/addresses/:id",
    { preHandler: [app.authenticate] },
    async (request) => {
      const input = parseBody(addressUpdateSchema, request.body);
      const params = request.params as { id: string };
      return addressService.updateForUser(request.user!.id, params.id, input);
    },
  );

  app.delete(
    "/addresses/:id",
    { preHandler: [app.authenticate] },
    async (request) => {
      const params = request.params as { id: string };
      return addressService.deleteForUser(request.user!.id, params.id);
    },
  );

  app.get(
    "/admin/ping",
    { preHandler: [app.authenticate, app.roleGuard(["admin", "super_admin"])] },
    async () => {
      return {
        status: "ok",
      };
    },
  );
};

export default authRoutes;
