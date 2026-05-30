import { randomUUID } from "node:crypto";
import fp from "fastify-plugin";
import type { FastifyPluginAsync } from "fastify";
import { requestContext } from "@bahce-shop/shared";

const requestContextPlugin: FastifyPluginAsync = async (app) => {
  app.addHook("onRequest", (request, reply, done) => {
    const requestId = request.headers["x-request-id"]?.toString() ?? randomUUID();

    reply.header("x-request-id", requestId);
    requestContext.run({ requestId }, () => done());
  });
};

export default fp(requestContextPlugin, {
  name: "request-context",
});
