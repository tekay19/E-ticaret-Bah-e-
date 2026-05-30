import { randomUUID } from "node:crypto";
import { ProductRepository } from "@bahce-shop/repositories";
import { InsufficientStockError, NotFoundError, ValidationError } from "@bahce-shop/shared";
import { ReservationService } from "../inventory/reservation.service.js";
import { CouponService } from "../coupon/coupon.service.js";
import { CartRepository } from "./cart.repository.js";
import type { Cart, CartItem, CartWarning } from "./types.js";

const AUTH_CART_TTL_SECONDS = 30 * 24 * 60 * 60;
const ANON_CART_TTL_SECONDS = 7 * 24 * 60 * 60;
const RESERVATION_TTL_SECONDS = 30 * 60;

export class CartService {
  private readonly carts = new CartRepository();
  private readonly coupons = new CouponService();
  private readonly products = new ProductRepository();
  private readonly reservations = new ReservationService();

  async getOrCreate(input: { cartId?: string | null; userId?: string | null; sessionId?: string | null }) {
    const existingUserCartId = input.userId ? await this.carts.findUserCartId(input.userId) : null;
    if (input.userId && existingUserCartId && input.cartId && existingUserCartId !== input.cartId) {
      const target = await this.carts.get(existingUserCartId);
      const source = await this.carts.get(input.cartId);

      if (target && source) {
        return this.mergeCarts(target, source, input.userId, input.sessionId ?? source.sessionId);
      }
    }

    const cartId = existingUserCartId ?? input.cartId;
    const existing = cartId ? await this.carts.get(cartId) : null;

    if (existing) {
      const next = {
        ...existing,
        userId: input.userId ?? existing.userId,
        sessionId: input.sessionId ?? existing.sessionId,
      };
      await this.save(next);
      return next;
    }

    const now = new Date().toISOString();
    const cart: Cart = {
      cartId: randomUUID(),
      userId: input.userId ?? null,
      sessionId: input.sessionId ?? null,
      items: [],
      appliedCouponCode: null,
      couponDiscountCents: 0,
      shippingChoice: null,
      createdAt: now,
      updatedAt: now,
    };

    await this.save(cart);
    return cart;
  }

  async addItem(input: {
    cartId?: string | null;
    userId?: string | null;
    sessionId?: string | null;
    variantId: string;
    qty: number;
  }) {
    const cart = await this.getOrCreate(input);
    const existing = cart.items.find((item) => item.variantId === input.variantId);
    const nextQty = (existing?.qty ?? 0) + input.qty;

    if (existing) {
      await this.reservations.release(existing.reservationRef);
      cart.items = cart.items.filter((item) => item.itemId !== existing.itemId);
    }

    const item = await this.buildReservedItem(input.variantId, nextQty);
    cart.items.push(item);
    cart.updatedAt = new Date().toISOString();

    await this.refreshCoupon(cart);
    await this.save(cart);
    return cart;
  }

  async updateQty(input: {
    cartId: string;
    itemId: string;
    qty: number;
  }) {
    const cart = await this.requireCart(input.cartId);
    const item = cart.items.find((candidate) => candidate.itemId === input.itemId);
    if (!item) {
      throw new NotFoundError("Sepet kalemi bulunamadi.");
    }

    await this.reservations.release(item.reservationRef);
    cart.items = cart.items.filter((candidate) => candidate.itemId !== input.itemId);

    if (input.qty > 0) {
      cart.items.push(await this.buildReservedItem(item.variantId, input.qty));
    }

    cart.updatedAt = new Date().toISOString();
    await this.refreshCoupon(cart);
    await this.save(cart);
    return cart;
  }

  async removeItem(cartId: string, itemId: string) {
    const cart = await this.requireCart(cartId);
    const item = cart.items.find((candidate) => candidate.itemId === itemId);
    if (!item) {
      throw new NotFoundError("Sepet kalemi bulunamadi.");
    }

    await this.reservations.release(item.reservationRef);
    cart.items = cart.items.filter((candidate) => candidate.itemId !== itemId);
    cart.updatedAt = new Date().toISOString();
    await this.refreshCoupon(cart);
    await this.save(cart);
    return cart;
  }

  async clear(cartId: string) {
    const cart = await this.requireCart(cartId);
    for (const item of cart.items) {
      await this.reservations.release(item.reservationRef);
    }

    cart.items = [];
    cart.appliedCouponCode = null;
    cart.couponDiscountCents = 0;
    cart.shippingChoice = null;
    cart.updatedAt = new Date().toISOString();
    await this.save(cart);
    return cart;
  }

  async validateCart(cartId: string) {
    const cart = await this.requireCart(cartId);
    const warnings: CartWarning[] = [];

    for (const item of cart.items) {
      const variant = await this.products.findCartVariantById(item.variantId);
      if (!variant || !variant.isActive || !variant.productIsActive) {
        warnings.push({
          type: "product_unavailable",
          variantId: item.variantId,
          message: "Urun artik satista degil.",
        });
        continue;
      }

      if (variant.priceCents !== item.unitPriceCents) {
        warnings.push({
          type: "price_changed",
          variantId: item.variantId,
          message: "Urun fiyati degisti.",
        });
      }
    }

    return {
      cart,
      warnings,
    };
  }

  async applyCoupon(cartId: string, code: string | null, userId?: string | null) {
    const cart = await this.requireCart(cartId);
    if (!code) {
      cart.appliedCouponCode = null;
      cart.couponDiscountCents = 0;
    } else {
      const validated = await this.coupons.validateCartCoupon({ code, cart, userId });
      cart.appliedCouponCode = validated.coupon.code;
      cart.couponDiscountCents = validated.discountCents;
    }
    cart.updatedAt = new Date().toISOString();
    await this.save(cart);
    return cart;
  }

  private async buildReservedItem(variantId: string, qty: number): Promise<CartItem> {
    if (qty < 1) {
      throw new ValidationError("Sepet miktari en az 1 olmali.");
    }

    const variant = await this.products.findCartVariantById(variantId);
    if (!variant || !variant.isActive || !variant.productIsActive) {
      throw new NotFoundError("Urun varyanti bulunamadi.");
    }

    const itemId = randomUUID();
    const reservationRef = `cart_${itemId}`;
    await this.reservations.reserve({
      variantId,
      quantity: qty,
      reservationType: "cart",
      referenceId: reservationRef,
      ttlSeconds: RESERVATION_TTL_SECONDS,
    });

    return {
      itemId,
      variantId,
      reservationRef,
      qty,
      unitPriceCents: variant.priceCents,
      productName: variant.productName,
      productSlug: variant.productSlug,
      variantSku: variant.sku,
      addedAt: new Date().toISOString(),
    };
  }

  private async requireCart(cartId: string) {
    const cart = await this.carts.get(cartId);
    if (!cart) {
      throw new NotFoundError("Sepet bulunamadi.");
    }

    return cart;
  }

  private async save(cart: Cart) {
    const ttl = cart.userId ? AUTH_CART_TTL_SECONDS : ANON_CART_TTL_SECONDS;
    await this.carts.save(cart, ttl);
    if (cart.userId) {
      await this.carts.setUserCart(cart.userId, cart.cartId, ttl);
    }
  }

  private async mergeCarts(target: Cart, source: Cart, userId: string, sessionId: string | null) {
    const merged: Cart = {
      ...target,
      userId,
      sessionId,
      updatedAt: new Date().toISOString(),
    };

    for (const sourceItem of source.items) {
      const targetItem = merged.items.find((item) => item.variantId === sourceItem.variantId);
      const nextQty = (targetItem?.qty ?? 0) + sourceItem.qty;

      await this.reservations.release(sourceItem.reservationRef);
      if (targetItem) {
        await this.reservations.release(targetItem.reservationRef);
        merged.items = merged.items.filter((item) => item.itemId !== targetItem.itemId);
      }

      merged.items.push(await this.buildReservedItem(sourceItem.variantId, nextQty));
    }

    await this.carts.delete(source.cartId);
    await this.refreshCoupon(merged);
    await this.save(merged);
    return merged;
  }

  private async refreshCoupon(cart: Cart) {
    if (!cart.appliedCouponCode) {
      cart.couponDiscountCents = 0;
      return;
    }

    try {
      const validated = await this.coupons.validateCartCoupon({
        code: cart.appliedCouponCode,
        cart,
        userId: cart.userId,
      });
      cart.appliedCouponCode = validated.coupon.code;
      cart.couponDiscountCents = validated.discountCents;
    } catch {
      cart.appliedCouponCode = null;
      cart.couponDiscountCents = 0;
    }
  }
}
