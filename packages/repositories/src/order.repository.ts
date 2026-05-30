import type { PoolClient } from "pg";
import { pool } from "@bahce-shop/db";
import type {
  OrderItemRecord,
  OrderRecord,
  OrderStatus,
  OrderStatusHistoryRecord,
  PaymentRecord,
  PaymentStatus,
} from "./types.js";

type Queryable = PoolClient | typeof pool;

type OrderRow = {
  id: string;
  order_number: string;
  cart_id: string | null;
  customer_id: string;
  status: OrderStatus;
  subtotal_cents: string;
  discount_cents: string;
  shipping_cents: string;
  tax_cents: string;
  total_cents: string;
  currency: string;
  shipping_address: Record<string, unknown>;
  billing_address: Record<string, unknown> | null;
  carrier_code: string;
  coupon_code: string | null;
  customer_note: string | null;
  internal_note: string | null;
  return_window_expires_at: Date | null;
  invoice_pdf_url: string | null;
  created_at: Date;
  updated_at: Date;
};

type OrderItemRow = {
  id: string;
  order_id: string;
  variant_id: string;
  reservation_ref: string;
  product_snapshot: Record<string, unknown>;
  variant_snapshot: Record<string, unknown>;
  quantity: number;
  unit_price_cents: string;
  total_cents: string;
};

type PaymentRow = {
  id: string;
  order_id: string;
  provider: string;
  provider_transaction_id: string | null;
  token: string | null;
  status: PaymentStatus;
  amount_cents: string;
  currency: string;
  card_last4: string | null;
  card_family: string | null;
  installment_count: number | null;
  raw_response: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
};

type OrderStatusHistoryRow = {
  id: string;
  order_id: string;
  from_status: OrderStatus | null;
  to_status: OrderStatus;
  reason: string | null;
  changed_by: string | null;
  changed_at: Date;
};

export type CreateOrderInput = {
  cartId?: string | null;
  customerId: string;
  subtotalCents: number;
  discountCents?: number;
  shippingCents: number;
  taxCents?: number;
  totalCents: number;
  shippingAddress: Record<string, unknown>;
  billingAddress?: Record<string, unknown> | null;
  carrierCode: string;
  couponCode?: string | null;
  customerNote?: string | null;
};

export type CreateOrderItemInput = {
  orderId: string;
  variantId: string;
  reservationRef: string;
  productSnapshot: Record<string, unknown>;
  variantSnapshot: Record<string, unknown>;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
};

export class OrderRepository {
  private getExecutor(client?: PoolClient): Queryable {
    return client ?? pool;
  }

  private mapOrder(row: OrderRow): OrderRecord {
    return {
      id: row.id,
      orderNumber: row.order_number,
      cartId: row.cart_id,
      customerId: row.customer_id,
      status: row.status,
      subtotalCents: Number(row.subtotal_cents),
      discountCents: Number(row.discount_cents),
      shippingCents: Number(row.shipping_cents),
      taxCents: Number(row.tax_cents),
      totalCents: Number(row.total_cents),
      currency: row.currency,
      shippingAddress: row.shipping_address,
      billingAddress: row.billing_address,
      carrierCode: row.carrier_code,
      couponCode: row.coupon_code,
      customerNote: row.customer_note,
      internalNote: row.internal_note,
      returnWindowExpiresAt: row.return_window_expires_at?.toISOString() ?? null,
      invoicePdfUrl: row.invoice_pdf_url,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  private mapItem(row: OrderItemRow): OrderItemRecord {
    return {
      id: row.id,
      orderId: row.order_id,
      variantId: row.variant_id,
      reservationRef: row.reservation_ref,
      productSnapshot: row.product_snapshot,
      variantSnapshot: row.variant_snapshot,
      quantity: row.quantity,
      unitPriceCents: Number(row.unit_price_cents),
      totalCents: Number(row.total_cents),
    };
  }

  private mapPayment(row: PaymentRow): PaymentRecord {
    return {
      id: row.id,
      orderId: row.order_id,
      provider: row.provider,
      providerTransactionId: row.provider_transaction_id,
      token: row.token,
      status: row.status,
      amountCents: Number(row.amount_cents),
      currency: row.currency,
      cardLast4: row.card_last4,
      cardFamily: row.card_family,
      installmentCount: row.installment_count,
      rawResponse: row.raw_response,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  private mapStatusHistory(row: OrderStatusHistoryRow): OrderStatusHistoryRecord {
    return {
      id: row.id,
      orderId: row.order_id,
      fromStatus: row.from_status,
      toStatus: row.to_status,
      reason: row.reason,
      changedBy: row.changed_by,
      changedAt: row.changed_at.toISOString(),
    };
  }

  async create(input: CreateOrderInput, client?: PoolClient) {
    const result = await this.getExecutor(client).query<OrderRow>(
      `INSERT INTO orders (
         cart_id, customer_id, subtotal_cents, discount_cents, shipping_cents, tax_cents,
         total_cents, shipping_address, billing_address, carrier_code, coupon_code, customer_note
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [
        input.cartId ?? null,
        input.customerId,
        input.subtotalCents,
        input.discountCents ?? 0,
        input.shippingCents,
        input.taxCents ?? 0,
        input.totalCents,
        input.shippingAddress,
        input.billingAddress ?? null,
        input.carrierCode,
        input.couponCode ?? null,
        input.customerNote ?? null,
      ],
    );

    const order = this.mapOrder(result.rows[0]);
    await this.recordStatus(order.id, null, order.status, "order_created", null, client);
    return order;
  }

  async createItem(input: CreateOrderItemInput, client?: PoolClient) {
    const result = await this.getExecutor(client).query<OrderItemRow>(
      `INSERT INTO order_items (
         order_id, variant_id, reservation_ref, product_snapshot, variant_snapshot,
         quantity, unit_price_cents, total_cents
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        input.orderId,
        input.variantId,
        input.reservationRef,
        input.productSnapshot,
        input.variantSnapshot,
        input.quantity,
        input.unitPriceCents,
        input.totalCents,
      ],
    );

    return this.mapItem(result.rows[0]);
  }

  async findById(id: string, client?: PoolClient) {
    const result = await this.getExecutor(client).query<OrderRow>(
      `SELECT * FROM orders WHERE id = $1`,
      [id],
    );
    return result.rows[0] ? this.mapOrder(result.rows[0]) : null;
  }

  async list(filter: { customerId?: string; status?: OrderStatus; from?: string; to?: string } = {}, client?: PoolClient) {
    const where: string[] = [];
    const params: unknown[] = [];
    if (filter.customerId) {
      params.push(filter.customerId);
      where.push(`customer_id = $${params.length}`);
    }
    if (filter.status) {
      params.push(filter.status);
      where.push(`status = $${params.length}`);
    }
    if (filter.from) {
      params.push(filter.from);
      where.push(`created_at >= $${params.length}`);
    }
    if (filter.to) {
      params.push(filter.to);
      where.push(`created_at <= $${params.length}`);
    }

    const result = await this.getExecutor(client).query<OrderRow>(
      `SELECT * FROM orders
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY created_at DESC
       LIMIT 100`,
      params,
    );
    return result.rows.map((row) => this.mapOrder(row));
  }

  async listItems(orderId: string, client?: PoolClient) {
    const result = await this.getExecutor(client).query<OrderItemRow>(
      `SELECT * FROM order_items WHERE order_id = $1 ORDER BY id ASC`,
      [orderId],
    );
    return result.rows.map((row) => this.mapItem(row));
  }

  async listStatusHistory(orderId: string, client?: PoolClient) {
    const result = await this.getExecutor(client).query<OrderStatusHistoryRow>(
      `SELECT * FROM order_status_history WHERE order_id = $1 ORDER BY changed_at ASC`,
      [orderId],
    );
    return result.rows.map((row) => this.mapStatusHistory(row));
  }

  async findItemById(id: string, client?: PoolClient) {
    const result = await this.getExecutor(client).query<OrderItemRow>(
      `SELECT * FROM order_items WHERE id = $1`,
      [id],
    );
    return result.rows[0] ? this.mapItem(result.rows[0]) : null;
  }

  async updateStatus(id: string, status: OrderStatus, reason: string | null, changedBy: string | null, client?: PoolClient) {
    const current = await this.findById(id, client);
    if (!current) return null;
    const result = await this.getExecutor(client).query<OrderRow>(
      `UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [status, id],
    );
    await this.recordStatus(id, current.status, status, reason, changedBy, client);
    return this.mapOrder(result.rows[0]);
  }

  async markDelivered(id: string, changedBy: string | null, client?: PoolClient) {
    const current = await this.findById(id, client);
    if (!current) return null;

    const result = await this.getExecutor(client).query<OrderRow>(
      `UPDATE orders
       SET status = 'delivered',
           return_window_expires_at = NOW() + INTERVAL '14 days',
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id],
    );
    await this.recordStatus(id, current.status, "delivered", "shipment_delivered", changedBy, client);
    return this.mapOrder(result.rows[0]);
  }

  async updateNote(id: string, internalNote: string, client?: PoolClient) {
    const result = await this.getExecutor(client).query<OrderRow>(
      `UPDATE orders SET internal_note = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [internalNote, id],
    );
    return result.rows[0] ? this.mapOrder(result.rows[0]) : null;
  }

  async createPayment(input: { orderId: string; token: string; amountCents: number; rawResponse: Record<string, unknown> }, client?: PoolClient) {
    const result = await this.getExecutor(client).query<PaymentRow>(
      `INSERT INTO payments (order_id, token, status, amount_cents, raw_response)
       VALUES ($1, $2, 'initialized', $3, $4)
       RETURNING *`,
      [input.orderId, input.token, input.amountCents, input.rawResponse],
    );
    return this.mapPayment(result.rows[0]);
  }

  async findPaymentByToken(token: string, client?: PoolClient) {
    const result = await this.getExecutor(client).query<PaymentRow>(
      `SELECT * FROM payments WHERE token = $1`,
      [token],
    );
    return result.rows[0] ? this.mapPayment(result.rows[0]) : null;
  }

  async findPaymentByOrderId(orderId: string, client?: PoolClient) {
    const result = await this.getExecutor(client).query<PaymentRow>(
      `SELECT * FROM payments WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [orderId],
    );
    return result.rows[0] ? this.mapPayment(result.rows[0]) : null;
  }

  async markPayment(id: string, status: PaymentStatus, rawResponse: Record<string, unknown>, providerTransactionId?: string, client?: PoolClient) {
    const result = await this.getExecutor(client).query<PaymentRow>(
      `UPDATE payments
       SET status = $1, raw_response = $2, provider_transaction_id = COALESCE($3, provider_transaction_id), updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [status, rawResponse, providerTransactionId ?? null, id],
    );
    return this.mapPayment(result.rows[0]);
  }

  async getIdempotency(key: string, endpoint: string, client?: PoolClient) {
    const result = await this.getExecutor(client).query<{ response_status: number | null; response_body: Record<string, unknown> | null }>(
      `SELECT response_status, response_body FROM idempotency_keys
       WHERE key = $1 AND endpoint = $2 AND expires_at > NOW()`,
      [key, endpoint],
    );
    return result.rows[0] ?? null;
  }

  async saveIdempotency(key: string, endpoint: string, responseStatus: number, responseBody: Record<string, unknown>, client?: PoolClient) {
    await this.getExecutor(client).query(
      `INSERT INTO idempotency_keys (key, endpoint, response_status, response_body, expires_at)
       VALUES ($1, $2, $3, $4, NOW() + INTERVAL '24 hours')
       ON CONFLICT (key) DO UPDATE SET response_status = EXCLUDED.response_status, response_body = EXCLUDED.response_body`,
      [key, endpoint, responseStatus, responseBody],
    );
  }

  async recordWebhook(eventId: string, provider: string, eventType: string, rawPayload: Record<string, unknown>, client?: PoolClient) {
    const result = await this.getExecutor(client).query(
      `INSERT INTO webhook_events (id, provider, event_type, raw_payload)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO NOTHING`,
      [eventId, provider, eventType, rawPayload],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async listTimedOutPending(client?: PoolClient) {
    const result = await this.getExecutor(client).query<OrderRow>(
      `SELECT * FROM orders
       WHERE status = 'pending_payment' AND created_at < NOW() - INTERVAL '20 minutes'
       ORDER BY created_at ASC
       LIMIT 100`,
    );
    return result.rows.map((row) => this.mapOrder(row));
  }

  async listExpiredReturnWindows(client?: PoolClient) {
    const result = await this.getExecutor(client).query<OrderRow>(
      `SELECT * FROM orders
       WHERE status = 'delivered'
         AND return_window_expires_at IS NOT NULL
         AND return_window_expires_at < NOW()
       ORDER BY return_window_expires_at ASC
       LIMIT 200`,
    );
    return result.rows.map((row) => this.mapOrder(row));
  }

  private async recordStatus(orderId: string, from: OrderStatus | null, to: OrderStatus, reason: string | null, changedBy: string | null, client?: PoolClient) {
    await this.getExecutor(client).query(
      `INSERT INTO order_status_history (order_id, from_status, to_status, reason, changed_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [orderId, from, to, reason, changedBy],
    );
  }
}
