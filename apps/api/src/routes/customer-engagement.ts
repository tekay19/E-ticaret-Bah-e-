import type { FastifyPluginAsync } from "fastify";
import type { ZodType } from "zod";
import {
  CustomerEngagementService,
  contactMessageInputSchema,
  customerProductItemInputSchema,
  newsletterSubscriptionInputSchema,
} from "@bahce-shop/domain";
import { ValidationError } from "@bahce-shop/shared";

function parseInput<T>(schema: ZodType<T>, payload: unknown): T {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues.map((issue) => issue.message).join(", "));
  }

  return parsed.data;
}

function readProductIdFromRequest(payload: unknown, query: unknown) {
  const productId = (query as { productId?: string }).productId ?? (payload as { productId?: string } | null)?.productId;
  return parseInput(customerProductItemInputSchema, { productId }).productId;
}

const customerEngagementRoutes: FastifyPluginAsync = async (app) => {
  const engagement = new CustomerEngagementService();

  app.post("/contact-messages", async (request) => {
    const input = parseInput(contactMessageInputSchema, request.body);
    return engagement.createContactMessage(input);
  });

  app.post("/newsletter/subscriptions", async (request) => {
    const input = parseInput(newsletterSubscriptionInputSchema, request.body);
    return engagement.subscribeNewsletter(input.email);
  });

  app.get("/wishlist/items", { preHandler: [app.authenticate] }, async (request) => {
    return engagement.listWishlist(request.user!.id);
  });

  app.post("/wishlist/items", { preHandler: [app.authenticate] }, async (request) => {
    const input = parseInput(customerProductItemInputSchema, request.body);
    return engagement.addWishlist(request.user!.id, input.productId);
  });

  app.delete("/wishlist/items", { preHandler: [app.authenticate] }, async (request) => {
    const productId = readProductIdFromRequest(request.body, request.query);
    return engagement.removeWishlist(request.user!.id, productId);
  });

  app.get("/compare/items", { preHandler: [app.authenticate] }, async (request) => {
    return engagement.listCompare(request.user!.id);
  });

  app.post("/compare/items", { preHandler: [app.authenticate] }, async (request) => {
    const input = parseInput(customerProductItemInputSchema, request.body);
    return engagement.addCompare(request.user!.id, input.productId);
  });

  app.delete("/compare/items", { preHandler: [app.authenticate] }, async (request) => {
    const productId = readProductIdFromRequest(request.body, request.query);
    return engagement.removeCompare(request.user!.id, productId);
  });
};

export default customerEngagementRoutes;
