import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import type { z } from "zod";
import {
  CheckoutService,
  checkoutConfirmSchema,
  checkoutInitiateSchema,
} from "@bahce-shop/domain";
import { ValidationError } from "@bahce-shop/shared";

function parseInput<T extends z.ZodTypeAny>(schema: T, payload: unknown): z.infer<T> {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues.map((issue) => issue.message).join(", "));
  }

  return parsed.data;
}

function readSignedCookie(request: FastifyRequest, name: string) {
  const value = request.cookies?.[name];
  if (!value) {
    return null;
  }

  const unsigned = request.unsignCookie(value);
  return unsigned.valid ? unsigned.value : null;
}

const checkoutRoutes: FastifyPluginAsync = async (app) => {
  const checkout = new CheckoutService();

  app.post("/checkout/initiate", { preHandler: [app.authenticate] }, async (request) => {
    const input = parseInput(checkoutInitiateSchema, request.body);
    const idempotencyKey = request.headers["idempotency-key"]?.toString();
    const cartId = input.cartId ?? readSignedCookie(request, "cartId");

    return checkout.initiate({
      userId: request.user!.id,
      idempotencyKey,
      cartId: cartId ?? undefined,
      shippingAddress: input.shippingAddress,
      billingAddress: input.billingAddress ?? null,
      carrierCode: input.carrierCode,
      shippingCents: input.shippingCents,
      customerNote: input.customerNote ?? null,
    });
  });

  app.post("/checkout/confirm", async (request) => {
    const input = parseInput(checkoutConfirmSchema, request.body);
    return checkout.confirm(input.token);
  });

  app.get("/checkout/mock-iyzico", async (request) => {
    const query = request.query as { token?: string; orderId?: string };
    return {
      token: query.token,
      orderId: query.orderId,
      message: "Mock iyzico page. POST /checkout/confirm with this token.",
    };
  });
};

export default checkoutRoutes;
