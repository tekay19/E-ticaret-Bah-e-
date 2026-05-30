import type { PoolClient } from "pg";
import { pool } from "@bahce-shop/db";
import type {
  InventoryMovementRecord,
  InventoryRecord,
  InventoryReservationRecord,
} from "./types.js";

type InventoryRow = {
  id: string;
  variant_id: string;
  on_hand: number;
  reserved: number;
  available: number;
  unit_type: InventoryRecord["unitType"];
  updated_at: Date;
};

type MovementRow = {
  id: string;
  variant_id: string;
  movement_type: InventoryMovementRecord["movementType"];
  quantity: number;
  reference_type: string | null;
  reference_id: string | null;
  reason: string | null;
  created_by: string | null;
  created_at: Date;
};

type ReservationRow = {
  id: string;
  variant_id: string;
  quantity: number;
  reservation_type: InventoryReservationRecord["reservationType"];
  reference_id: string;
  expires_at: Date;
  released_at: Date | null;
  created_at: Date;
};

type Queryable = PoolClient | typeof pool;

export type MovementInput = {
  variantId: string;
  movementType: InventoryMovementRecord["movementType"];
  quantity: number;
  referenceType?: string | null;
  referenceId?: string | null;
  reason?: string | null;
  createdBy?: string | null;
};

export type ReservationInput = {
  variantId: string;
  quantity: number;
  reservationType: InventoryReservationRecord["reservationType"];
  referenceId: string;
  expiresAt: string;
};

export class InventoryRepository {
  private getExecutor(client?: PoolClient): Queryable {
    return client ?? pool;
  }

  private mapInventory(row: InventoryRow): InventoryRecord {
    return {
      id: row.id,
      variantId: row.variant_id,
      onHand: row.on_hand,
      reserved: row.reserved,
      available: row.available,
      unitType: row.unit_type,
      updatedAt: row.updated_at.toISOString(),
    };
  }

  private mapMovement(row: MovementRow): InventoryMovementRecord {
    return {
      id: row.id,
      variantId: row.variant_id,
      movementType: row.movement_type,
      quantity: row.quantity,
      referenceType: row.reference_type,
      referenceId: row.reference_id,
      reason: row.reason,
      createdBy: row.created_by,
      createdAt: row.created_at.toISOString(),
    };
  }

  private mapReservation(row: ReservationRow): InventoryReservationRecord {
    return {
      id: row.id,
      variantId: row.variant_id,
      quantity: row.quantity,
      reservationType: row.reservation_type,
      referenceId: row.reference_id,
      expiresAt: row.expires_at.toISOString(),
      releasedAt: row.released_at?.toISOString() ?? null,
      createdAt: row.created_at.toISOString(),
    };
  }

  async upsertInventory(
    variantId: string,
    input: { onHand?: number; reserved?: number; unitType?: InventoryRecord["unitType"] },
    client?: PoolClient,
  ) {
    const result = await this.getExecutor(client).query<InventoryRow>(
      `INSERT INTO inventory (variant_id, on_hand, reserved, unit_type)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (variant_id) DO UPDATE SET
         on_hand = CASE WHEN $5 THEN EXCLUDED.on_hand ELSE inventory.on_hand END,
         reserved = CASE WHEN $6 THEN EXCLUDED.reserved ELSE inventory.reserved END,
         unit_type = CASE WHEN $7 THEN EXCLUDED.unit_type ELSE inventory.unit_type END,
         updated_at = NOW()
       RETURNING *`,
      [
        variantId,
        input.onHand ?? 0,
        input.reserved ?? 0,
        input.unitType ?? "piece",
        input.onHand !== undefined,
        input.reserved !== undefined,
        input.unitType !== undefined,
      ],
    );

    return this.mapInventory(result.rows[0]);
  }

  async findByVariantId(variantId: string, client?: PoolClient) {
    const result = await this.getExecutor(client).query<InventoryRow>(
      `SELECT * FROM inventory WHERE variant_id = $1`,
      [variantId],
    );

    return result.rows[0] ? this.mapInventory(result.rows[0]) : null;
  }

  async adjustOnHand(variantId: string, quantity: number, client?: PoolClient) {
    const result = await this.getExecutor(client).query<InventoryRow>(
      `UPDATE inventory
       SET on_hand = on_hand + $1, updated_at = NOW()
       WHERE variant_id = $2
       RETURNING *`,
      [quantity, variantId],
    );

    return result.rows[0] ? this.mapInventory(result.rows[0]) : null;
  }

  async adjustReserved(variantId: string, quantity: number, client?: PoolClient) {
    const result = await this.getExecutor(client).query<InventoryRow>(
      `UPDATE inventory
       SET reserved = reserved + $1, updated_at = NOW()
       WHERE variant_id = $2
       RETURNING *`,
      [quantity, variantId],
    );

    return result.rows[0] ? this.mapInventory(result.rows[0]) : null;
  }

  async recordMovement(input: MovementInput, client?: PoolClient) {
    const result = await this.getExecutor(client).query<MovementRow>(
      `INSERT INTO inventory_movements (
         variant_id, movement_type, quantity, reference_type, reference_id, reason, created_by
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        input.variantId,
        input.movementType,
        input.quantity,
        input.referenceType ?? null,
        input.referenceId ?? null,
        input.reason ?? null,
        input.createdBy ?? null,
      ],
    );

    return this.mapMovement(result.rows[0]);
  }

  async listMovements(
    filter: { variantId?: string; from?: string; to?: string },
    client?: PoolClient,
  ) {
    const where: string[] = [];
    const params: unknown[] = [];

    if (filter.variantId) {
      params.push(filter.variantId);
      where.push(`variant_id = $${params.length}`);
    }
    if (filter.from) {
      params.push(filter.from);
      where.push(`created_at >= $${params.length}`);
    }
    if (filter.to) {
      params.push(filter.to);
      where.push(`created_at <= $${params.length}`);
    }

    const result = await this.getExecutor(client).query<MovementRow>(
      `SELECT * FROM inventory_movements
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY created_at DESC
       LIMIT 200`,
      params,
    );

    return result.rows.map((row) => this.mapMovement(row));
  }

  async createReservation(input: ReservationInput, client?: PoolClient) {
    const result = await this.getExecutor(client).query<ReservationRow>(
      `INSERT INTO inventory_reservations (
         variant_id, quantity, reservation_type, reference_id, expires_at
       )
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        input.variantId,
        input.quantity,
        input.reservationType,
        input.referenceId,
        input.expiresAt,
      ],
    );

    return this.mapReservation(result.rows[0]);
  }

  async findReservation(referenceId: string, variantId: string, client?: PoolClient) {
    const result = await this.getExecutor(client).query<ReservationRow>(
      `SELECT * FROM inventory_reservations
       WHERE reference_id = $1 AND variant_id = $2`,
      [referenceId, variantId],
    );

    return result.rows[0] ? this.mapReservation(result.rows[0]) : null;
  }

  async releaseReservation(referenceId: string, client?: PoolClient) {
    const result = await this.getExecutor(client).query<ReservationRow>(
      `UPDATE inventory_reservations
       SET released_at = NOW()
       WHERE reference_id = $1 AND released_at IS NULL
       RETURNING *`,
      [referenceId],
    );

    return result.rows.map((row) => this.mapReservation(row));
  }

  async listExpiredReservations(client?: PoolClient) {
    const result = await this.getExecutor(client).query<ReservationRow>(
      `SELECT * FROM inventory_reservations
       WHERE released_at IS NULL AND expires_at < NOW()
       ORDER BY expires_at ASC
       LIMIT 200`,
    );

    return result.rows.map((row) => this.mapReservation(row));
  }

  async listLowStock(client?: PoolClient) {
    const result = await this.getExecutor(client).query<
      InventoryRow & { product_id: string; product_name: string; min_stock_alert: number; sku: string }
    >(
      `SELECT i.*, p.id AS product_id, p.name AS product_name, p.min_stock_alert, pv.sku
       FROM inventory i
       JOIN product_variants pv ON pv.id = i.variant_id
       JOIN products p ON p.id = pv.product_id
       WHERE i.available <= p.min_stock_alert AND p.is_active = TRUE
       ORDER BY i.available ASC, p.name ASC`,
    );

    return result.rows.map((row) => ({
      ...this.mapInventory(row),
      productId: row.product_id,
      productName: row.product_name,
      minStockAlert: row.min_stock_alert,
      sku: row.sku,
    }));
  }

  async listStock(client?: PoolClient) {
    const result = await this.getExecutor(client).query<
      InventoryRow & { product_id: string; product_name: string; sku: string }
    >(
      `SELECT i.*, p.id AS product_id, p.name AS product_name, pv.sku
       FROM inventory i
       JOIN product_variants pv ON pv.id = i.variant_id
       JOIN products p ON p.id = pv.product_id
       WHERE p.is_active = TRUE
       ORDER BY p.name ASC, pv.sku ASC`,
    );

    return result.rows.map((row) => ({
      ...this.mapInventory(row),
      productId: row.product_id,
      productName: row.product_name,
      sku: row.sku,
    }));
  }
}
