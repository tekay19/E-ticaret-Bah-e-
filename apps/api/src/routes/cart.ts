import { randomUUID } from "node:crypto";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import type { ZodType } from "zod";
import {
  CartService,
  ShippingCalculator,
  addCartItemSchema,
  couponSchema,
  shippingOptionsSchema,
  updateCartItemSchema,
} from "@bahce-shop/domain";
import { ValidationError } from "@bahce-shop/shared";

const CART_ID_COOKIE = "cartId";
const SESSION_ID_COOKIE = "sessionId";

function parseInput<T>(schema: ZodType<T>, payload: unknown): T {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues.map((issue) => issue.message).join(", "));
  }

  return parsed.data;
}

function setLongLivedCookie(reply: FastifyReply, name: string, value: string) {
  reply.setCookie(name, value, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    signed: true,
    maxAge: 30 * 24 * 60 * 60,
  });
}

function readSignedCookie(request: FastifyRequest, name: string) {
  const value = request.cookies[name];
  if (!value) {
    return null;
  }

  const unsigned = request.unsignCookie(value);
  return unsigned.valid ? unsigned.value : null;
}

async function identifyCart(request: FastifyRequest, reply: FastifyReply, carts: CartService) {
  let cartId = readSignedCookie(request, CART_ID_COOKIE);
  let sessionId = readSignedCookie(request, SESSION_ID_COOKIE);

  if (!sessionId) {
    sessionId = randomUUID();
    setLongLivedCookie(reply, SESSION_ID_COOKIE, sessionId);
  }

  const cart = await carts.getOrCreate({
    cartId,
    sessionId,
    userId: request.user?.id ?? null,
  });

  if (!cartId || cartId !== cart.cartId) {
    setLongLivedCookie(reply, CART_ID_COOKIE, cart.cartId);
  }

  return cart;
}

const cartRoutes: FastifyPluginAsync = async (app) => {
  const carts = new CartService();
  const shipping = new ShippingCalculator();

  app.get("/cart", { preHandler: [app.optionalAuthenticate] }, async (request, reply) => {
    const cart = await identifyCart(request, reply, carts);
    return { data: cart };
  });

  app.post("/cart/items", { preHandler: [app.optionalAuthenticate] }, async (request, reply) => {
    const cart = await identifyCart(request, reply, carts);
    const input = parseInput(addCartItemSchema, request.body);
    const updated = await carts.addItem({
      cartId: cart.cartId,
      sessionId: cart.sessionId,
      userId: request.user?.id ?? null,
      ...input,
    });

    setLongLivedCookie(reply, CART_ID_COOKIE, updated.cartId);
    return { data: updated };
  });

  app.patch("/cart/items/:itemId", { preHandler: [app.optionalAuthenticate] }, async (request, reply) => {
    const cart = await identifyCart(request, reply, carts);
    const params = request.params as { itemId: string };
    const input = parseInput(updateCartItemSchema, request.body);
    return {
      data: await carts.updateQty({
        cartId: cart.cartId,
        itemId: params.itemId,
        qty: input.qty,
      }),
    };
  });

  app.delete("/cart/items/:itemId", { preHandler: [app.optionalAuthenticate] }, async (request, reply) => {
    const cart = await identifyCart(request, reply, carts);
    const params = request.params as { itemId: string };
    return { data: await carts.removeItem(cart.cartId, params.itemId) };
  });

  app.post("/cart/clear", { preHandler: [app.optionalAuthenticate] }, async (request, reply) => {
    const cart = await identifyCart(request, reply, carts);
    return { data: await carts.clear(cart.cartId) };
  });

  app.post("/cart/validate", { preHandler: [app.optionalAuthenticate] }, async (request, reply) => {
    const cart = await identifyCart(request, reply, carts);
    return carts.validateCart(cart.cartId);
  });

  app.post("/cart/coupon", { preHandler: [app.optionalAuthenticate] }, async (request, reply) => {
    const cart = await identifyCart(request, reply, carts);
    const input = parseInput(couponSchema, request.body);
    return { data: await carts.applyCoupon(cart.cartId, input.code, request.user?.id ?? null) };
  });

  app.delete("/cart/coupon", { preHandler: [app.optionalAuthenticate] }, async (request, reply) => {
    const cart = await identifyCart(request, reply, carts);
    return { data: await carts.applyCoupon(cart.cartId, null, request.user?.id ?? null) };
  });

  app.post("/cart/shipping/options", { preHandler: [app.optionalAuthenticate] }, async (request, reply) => {
    const cart = await identifyCart(request, reply, carts);
    parseInput(shippingOptionsSchema, request.body ?? {});
    return { data: await shipping.calculate(cart) };
  });
};

export default cartRoutes;
