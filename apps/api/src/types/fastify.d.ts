import type { AuthenticatedUser, UserRole } from "@bahce-shop/shared";

declare module "fastify" {
  interface FastifyRequest {
    user: AuthenticatedUser | null;
  }

  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: import("fastify").FastifyReply) => Promise<void>;
    optionalAuthenticate: (request: FastifyRequest, reply: import("fastify").FastifyReply) => Promise<void>;
    roleGuard: (roles: UserRole[]) => (request: FastifyRequest, reply: import("fastify").FastifyReply) => Promise<void>;
  }
}
