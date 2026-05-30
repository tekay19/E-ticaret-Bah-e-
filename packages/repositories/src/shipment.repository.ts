import type { PoolClient } from "pg";
import { pool } from "@bahce-shop/db";
import type {
  CarrierCode,
  ShipmentEventRecord,
  ShipmentRecord,
  ShipmentStatus,
} from "./types.js";

type Queryable = PoolClient | typeof pool;

type ShipmentRow = {
  id: string;
  order_id: string;
  carrier_code: CarrierCode;
  tracking_number: string | null;
  label_url: string | null;
  status: ShipmentStatus;
  estimated_delivery_date: Date | null;
  delivered_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

type ShipmentEventRow = {
  id: string;
  shipment_id: string;
  event_type: ShipmentStatus | string;
  description: string | null;
  location: string | null;
  occurred_at: Date;
  raw_payload: Record<string, unknown> | null;
  event_dedupe_key: string | null;
  created_at: Date;
};

export type CreateShipmentInput = {
  orderId: string;
  carrierCode: CarrierCode;
  trackingNumber: string;
  labelUrl: string;
  status?: ShipmentStatus;
  estimatedDeliveryDate?: string | null;
};

export type CreateShipmentEventInput = {
  shipmentId: string;
  eventType: ShipmentStatus | string;
  description?: string | null;
  location?: string | null;
  occurredAt: string;
  rawPayload?: Record<string, unknown> | null;
  eventDedupeKey?: string | null;
};

export class ShipmentRepository {
  private getExecutor(client?: PoolClient): Queryable {
    return client ?? pool;
  }

  private mapShipment(row: ShipmentRow): ShipmentRecord {
    return {
      id: row.id,
      orderId: row.order_id,
      carrierCode: row.carrier_code,
      trackingNumber: row.tracking_number,
      labelUrl: row.label_url,
      status: row.status,
      estimatedDeliveryDate: row.estimated_delivery_date?.toISOString().slice(0, 10) ?? null,
      deliveredAt: row.delivered_at?.toISOString() ?? null,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  private mapEvent(row: ShipmentEventRow): ShipmentEventRecord {
    return {
      id: row.id,
      shipmentId: row.shipment_id,
      eventType: row.event_type,
      description: row.description,
      location: row.location,
      occurredAt: row.occurred_at.toISOString(),
      rawPayload: row.raw_payload,
      eventDedupeKey: row.event_dedupe_key,
      createdAt: row.created_at.toISOString(),
    };
  }

  async create(input: CreateShipmentInput, client?: PoolClient) {
    const result = await this.getExecutor(client).query<ShipmentRow>(
      `INSERT INTO shipments (
         order_id, carrier_code, tracking_number, label_url, status, estimated_delivery_date
       )
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        input.orderId,
        input.carrierCode,
        input.trackingNumber,
        input.labelUrl,
        input.status ?? "created",
        input.estimatedDeliveryDate ?? null,
      ],
    );

    return this.mapShipment(result.rows[0]);
  }

  async findByOrderId(orderId: string, client?: PoolClient) {
    const result = await this.getExecutor(client).query<ShipmentRow>(
      `SELECT * FROM shipments WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [orderId],
    );
    return result.rows[0] ? this.mapShipment(result.rows[0]) : null;
  }

  async findByTrackingNumber(trackingNumber: string, client?: PoolClient) {
    const result = await this.getExecutor(client).query<ShipmentRow>(
      `SELECT * FROM shipments WHERE tracking_number = $1`,
      [trackingNumber],
    );
    return result.rows[0] ? this.mapShipment(result.rows[0]) : null;
  }

  async listActiveForPolling(client?: PoolClient) {
    const result = await this.getExecutor(client).query<ShipmentRow>(
      `SELECT s.* FROM shipments s
       JOIN orders o ON o.id = s.order_id
       WHERE s.status NOT IN ('delivered', 'returned', 'failed')
         AND s.created_at > NOW() - INTERVAL '30 days'
       ORDER BY s.created_at ASC
       LIMIT 200`,
    );
    return result.rows.map((row) => this.mapShipment(row));
  }

  async updateStatus(input: {
    id: string;
    status: ShipmentStatus;
    estimatedDeliveryDate?: string | null;
    deliveredAt?: string | null;
  }, client?: PoolClient) {
    const result = await this.getExecutor(client).query<ShipmentRow>(
      `UPDATE shipments
       SET status = $1,
           estimated_delivery_date = COALESCE($2, estimated_delivery_date),
           delivered_at = CASE WHEN $3::timestamptz IS NOT NULL THEN $3::timestamptz ELSE delivered_at END,
           updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [
        input.status,
        input.estimatedDeliveryDate ?? null,
        input.deliveredAt ?? null,
        input.id,
      ],
    );
    return result.rows[0] ? this.mapShipment(result.rows[0]) : null;
  }

  async createEvent(input: CreateShipmentEventInput, client?: PoolClient) {
    const result = await this.getExecutor(client).query<ShipmentEventRow>(
      `INSERT INTO shipment_events (
         shipment_id, event_type, description, location, occurred_at, raw_payload, event_dedupe_key
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (event_dedupe_key) DO NOTHING
       RETURNING *`,
      [
        input.shipmentId,
        input.eventType,
        input.description ?? null,
        input.location ?? null,
        input.occurredAt,
        input.rawPayload ?? null,
        input.eventDedupeKey ?? null,
      ],
    );
    return result.rows[0] ? this.mapEvent(result.rows[0]) : null;
  }

  async listEvents(shipmentId: string, client?: PoolClient) {
    const result = await this.getExecutor(client).query<ShipmentEventRow>(
      `SELECT * FROM shipment_events
       WHERE shipment_id = $1
       ORDER BY occurred_at DESC, created_at DESC`,
      [shipmentId],
    );
    return result.rows.map((row) => this.mapEvent(row));
  }
}
