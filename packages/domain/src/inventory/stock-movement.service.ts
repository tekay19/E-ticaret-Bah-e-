import type { PoolClient } from "pg";
import { withTransaction } from "@bahce-shop/db";
import {
  InsufficientStockError,
  NotFoundError,
  ValidationError,
} from "@bahce-shop/shared";
import {
  InventoryRepository,
  ProductRepository,
  type MovementInput,
} from "@bahce-shop/repositories";

export class StockMovementService {
  private readonly inventory = new InventoryRepository();
  private readonly products = new ProductRepository();

  async setInventory(input: {
    variantId: string;
    onHand: number;
    reserved?: number;
    unitType?: "piece" | "kg" | "liter" | "meter" | "bag" | "pack";
  }) {
    await this.ensureVariantExists(input.variantId);
    return this.inventory.upsertInventory(input.variantId, input);
  }

  async record(input: MovementInput, client?: PoolClient) {
    const run = async (tx: PoolClient) => {
      await this.ensureVariantExists(input.variantId, tx);
      await this.inventory.upsertInventory(input.variantId, {}, tx);
      const movement = await this.inventory.recordMovement(input, tx);
      const updated = await this.inventory.adjustOnHand(input.variantId, input.quantity, tx);

      if (!updated) {
        throw new NotFoundError("Stok kaydi bulunamadi.");
      }

      return {
        movement,
        inventory: updated,
      };
    };

    try {
      return client ? await run(client) : await withTransaction(run);
    } catch (error) {
      if (error instanceof Error && error.message.includes("inventory_non_negative")) {
        throw new InsufficientStockError();
      }

      throw error;
    }
  }

  async listMovements(filter: { variantId?: string; from?: string; to?: string }) {
    return this.inventory.listMovements(filter);
  }

  async listStock() {
    return this.inventory.listStock();
  }

  async lowStock() {
    return this.inventory.listLowStock();
  }

  private async ensureVariantExists(variantId: string, client?: PoolClient) {
    const variant = await this.products.findVariantById(variantId, client);
    if (!variant) {
      throw new NotFoundError("Varyant bulunamadi.");
    }
  }
}
