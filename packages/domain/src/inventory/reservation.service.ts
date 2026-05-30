import { randomUUID } from "node:crypto";
import { withTransaction } from "@bahce-shop/db";
import {
  InsufficientStockError,
  NotFoundError,
  ValidationError,
} from "@bahce-shop/shared";
import {
  InventoryRepository,
  ProductRepository,
} from "@bahce-shop/repositories";
import {
  createRedisClient,
  createStockSyncQueue,
} from "@bahce-shop/workers";
import { StockMovementService } from "./stock-movement.service.js";

const reserveScript = `
local stock = cjson.decode(redis.call('GET', KEYS[1]) or '{"onHand":0,"reserved":0}')
local quantity = tonumber(ARGV[1])
if stock.onHand - stock.reserved < quantity then
  return -1
end
stock.reserved = stock.reserved + quantity
redis.call('SET', KEYS[1], cjson.encode(stock))
redis.call('SETEX', 'res:' .. ARGV[2], tonumber(ARGV[3]), cjson.encode({
  variantId = ARGV[4],
  qty = quantity
}))
return stock.onHand - stock.reserved
`;

export class ReservationService {
  private readonly redis = createRedisClient("reservation-service");
  private readonly inventory = new InventoryRepository();
  private readonly products = new ProductRepository();
  private readonly movements = new StockMovementService();
  private readonly stockSyncQueue = createStockSyncQueue();

  async primeStock(variantId: string) {
    const inventory = await this.inventory.findByVariantId(variantId);
    if (!inventory) {
      throw new NotFoundError("Stok kaydi bulunamadi.");
    }

    await this.redis.set(
      this.stockKey(variantId),
      JSON.stringify({ onHand: inventory.onHand, reserved: inventory.reserved }),
    );

    return inventory;
  }

  async reserve(input: {
    variantId: string;
    quantity: number;
    reservationType: "cart" | "order";
    referenceId?: string;
    ttlSeconds: number;
  }) {
    await this.ensureVariantExists(input.variantId);

    let inventory = await this.inventory.findByVariantId(input.variantId);
    if (!inventory) {
      inventory = await this.inventory.upsertInventory(input.variantId, {});
    }

    const key = this.stockKey(input.variantId);
    const existingStock = await this.redis.get(key);
    if (!existingStock) {
      await this.primeStock(input.variantId);
    }

    const referenceId = input.referenceId ?? randomUUID();
    const remaining = Number(
      await this.redis.eval(
        reserveScript,
        1,
        key,
        String(input.quantity),
        referenceId,
        String(input.ttlSeconds),
        input.variantId,
      ),
    );

    if (remaining < 0) {
      throw new InsufficientStockError();
    }

    await this.stockSyncQueue.add("sync-reservation", {
      variantId: input.variantId,
      quantity: input.quantity,
      reservationType: input.reservationType,
      referenceId,
      expiresAt: new Date(Date.now() + input.ttlSeconds * 1000).toISOString(),
    });

    return {
      referenceId,
      remaining,
    };
  }

  async release(referenceId: string) {
    const reservations = await this.inventory.releaseReservation(referenceId);
    for (const reservation of reservations) {
      await this.adjustRedisReserved(reservation.variantId, -reservation.quantity);
      await this.inventory.adjustReserved(reservation.variantId, -reservation.quantity);
    }

    await this.redis.del(`res:${referenceId}`);
    return {
      released: reservations.length,
    };
  }

  async completeOrderReservation(referenceId: string) {
    const reservations = await this.inventory.releaseReservation(referenceId);
    if (reservations.length === 0) {
      throw new ValidationError("Aktif rezervasyon bulunamadi.");
    }

    await withTransaction(async (client) => {
      for (const reservation of reservations) {
        await this.movements.record(
          {
            variantId: reservation.variantId,
            movementType: "sale",
            quantity: -reservation.quantity,
            referenceType: reservation.reservationType,
            reason: `Rezervasyon siparise donustu: ${referenceId}`,
          },
          client,
        );
        await this.inventory.adjustReserved(reservation.variantId, -reservation.quantity, client);
        await this.adjustRedisSale(reservation.variantId, reservation.quantity);
      }
    });

    await this.redis.del(`res:${referenceId}`);
    return { success: true };
  }

  private async adjustRedisReserved(variantId: string, delta: number) {
    const key = this.stockKey(variantId);
    const current = JSON.parse((await this.redis.get(key)) ?? '{"onHand":0,"reserved":0}') as {
      onHand: number;
      reserved: number;
    };
    current.reserved = Math.max(0, current.reserved + delta);
    await this.redis.set(key, JSON.stringify(current));
  }

  private async adjustRedisSale(variantId: string, quantity: number) {
    const key = this.stockKey(variantId);
    const current = JSON.parse((await this.redis.get(key)) ?? '{"onHand":0,"reserved":0}') as {
      onHand: number;
      reserved: number;
    };
    current.onHand = Math.max(0, current.onHand - quantity);
    current.reserved = Math.max(0, current.reserved - quantity);
    await this.redis.set(key, JSON.stringify(current));
  }

  private stockKey(variantId: string) {
    return `stock:${variantId}`;
  }

  private async ensureVariantExists(variantId: string) {
    const variant = await this.products.findVariantById(variantId);
    if (!variant) {
      throw new NotFoundError("Varyant bulunamadi.");
    }
  }
}
