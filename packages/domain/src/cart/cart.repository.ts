import { createRedisClient } from "@bahce-shop/workers";
import type { Cart } from "./types.js";

export class CartRepository {
  private readonly redis = createRedisClient("cart-repository");

  async get(cartId: string): Promise<Cart | null> {
    const raw = await this.redis.get(this.key(cartId));
    return raw ? (JSON.parse(raw) as Cart) : null;
  }

  async save(cart: Cart, ttlSeconds: number): Promise<void> {
    await this.redis.set(this.key(cart.cartId), JSON.stringify(cart), "EX", ttlSeconds);
  }

  async delete(cartId: string): Promise<void> {
    await this.redis.del(this.key(cartId));
  }

  async findUserCartId(userId: string): Promise<string | null> {
    return this.redis.get(this.userKey(userId));
  }

  async setUserCart(userId: string, cartId: string, ttlSeconds: number): Promise<void> {
    await this.redis.set(this.userKey(userId), cartId, "EX", ttlSeconds);
  }

  async deleteUserCart(userId: string): Promise<void> {
    const cartId = await this.findUserCartId(userId);
    if (cartId) {
      await this.delete(cartId);
    }
    await this.redis.del(this.userKey(userId));
  }

  private key(cartId: string) {
    return `cart:${cartId}`;
  }

  private userKey(userId: string) {
    return `cart:user:${userId}`;
  }
}
