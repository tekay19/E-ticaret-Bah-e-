import fp from "fastify-plugin";
import rateLimit from "@fastify/rate-limit";
import type { FastifyPluginAsync } from "fastify";
import { createRedisClient } from "@bahce-shop/workers";

const rateLimitPlugin: FastifyPluginAsync = async (app) => {
  const redis = createRedisClient("rate-limit");

  await (app as any).register(rateLimit, {
    global: false,
    redis,
    addHeadersOnExceeding: {
      "x-ratelimit-remaining": true,
      "x-ratelimit-reset": true,
    },
  });

  app.addHook("onClose", async () => {
    await redis.quit();
  });
};

export default fp(rateLimitPlugin, {
  name: "rate-limit",
});
