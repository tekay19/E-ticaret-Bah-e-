import fp from "fastify-plugin";
import type { FastifyPluginAsync } from "fastify";
import { env } from "@bahce-shop/shared";

const securityHeadersPlugin: FastifyPluginAsync = async (app) => {
  app.addHook("onRequest", async (_request, reply) => {
    reply.header("x-content-type-options", "nosniff");
    reply.header("x-frame-options", "DENY");
    reply.header("referrer-policy", "no-referrer");
    reply.header("permissions-policy", "camera=(), microphone=(), geolocation=(), payment=()");
    reply.header("cross-origin-resource-policy", "same-site");
    reply.header("content-security-policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");

    if (env.NODE_ENV === "production") {
      reply.header("strict-transport-security", "max-age=31536000; includeSubDomains");
    }
  });
};

export default fp(securityHeadersPlugin, {
  name: "security-headers",
});
