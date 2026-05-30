import type { PoolClient } from "pg";
import { pool } from "@bahce-shop/db";
import type {
  RefundRecord,
  RefundStatus,
  ReturnItemCondition,
  ReturnItemRecord,
  ReturnReason,
  ReturnRecord,
  ReturnShippingPaidBy,
  ReturnStatus,
  ReturnStatusHistoryRecord,
} from "./types.js";

type Queryable = PoolClient | typeof pool;

type ReturnRow = {
  id: string;
  return_number: string;
  order_id: string;
  customer_id: string;
  status: ReturnStatus;
  reason: ReturnReason;
  customer_note: string | null;
  admin_note: string | null;
  photos: string[] | null;
  return_shipping_paid_by: ReturnShippingPaidBy;
  return_tracking_number: string | null;
  refund_amount_cents: string | null;
  rejected_reason: string | null;
  requested_at: Date;
  approved_at: Date | null;
  received_at: Date | null;
  refunded_at: Date | null;
};

type ReturnItemRow = {
  id: string;
  return_id: string;
  order_item_id: string;
  quantity: number;
  unit_refund_cents: string;
  item_condition: ReturnItemCondition | null;
  restock_eligible: boolean;
};

type ReturnStatusHistoryRow = {
  id: string;
  return_id: string;
  from_status: ReturnStatus | null;
  to_status: ReturnStatus;
  reason: string | null;
  changed_by: string | null;
  changed_at: Date;
};

type RefundRow = {
  id: string;
  return_id: string | null;
  order_id: string;
  payment_id: string;
  amount_cents: string;
  status: RefundStatus;
  provider_refund_id: string | null;
  attempt_count: number;
  last_error: string | null;
  created_at: Date;
  completed_at: Date | null;
};

export type CreateReturnInput = {
  orderId: string;
  customerId: string;
  reason: ReturnReason;
  customerNote?: string | null;
  photos?: string[] | null;
  returnShippingPaidBy: ReturnShippingPaidBy;
  refundAmountCents: number;
};

export type CreateReturnItemInput = {
  returnId: string;
  orderItemId: string;
  quantity: number;
  unitRefundCents: number;
};

export class ReturnRepository {
  private getExecutor(client?: PoolClient): Queryable {
    return client ?? pool;
  }

  private mapReturn(row: ReturnRow): ReturnRecord {
    return {
      id: row.id,
      returnNumber: row.return_number,
      orderId: row.order_id,
      customerId: row.customer_id,
      status: row.status,
      reason: row.reason,
      customerNote: row.customer_note,
      adminNote: row.admin_note,
      photos: row.photos,
      returnShippingPaidBy: row.return_shipping_paid_by,
      returnTrackingNumber: row.return_tracking_number,
      refundAmountCents: row.refund_amount_cents === null ? null : Number(row.refund_amount_cents),
      rejectedReason: row.rejected_reason,
      requestedAt: row.requested_at.toISOString(),
      approvedAt: row.approved_at?.toISOString() ?? null,
      receivedAt: row.received_at?.toISOString() ?? null,
      refundedAt: row.refunded_at?.toISOString() ?? null,
    };
  }

  private mapItem(row: ReturnItemRow): ReturnItemRecord {
    return {
      id: row.id,
      returnId: row.return_id,
      orderItemId: row.order_item_id,
      quantity: row.quantity,
      unitRefundCents: Number(row.unit_refund_cents),
      itemCondition: row.item_condition,
      restockEligible: row.restock_eligible,
    };
  }

  private mapHistory(row: ReturnStatusHistoryRow): ReturnStatusHistoryRecord {
    return {
      id: row.id,
      returnId: row.return_id,
      fromStatus: row.from_status,
      toStatus: row.to_status,
      reason: row.reason,
      changedBy: row.changed_by,
      changedAt: row.changed_at.toISOString(),
    };
  }

  private mapRefund(row: RefundRow): RefundRecord {
    return {
      id: row.id,
      returnId: row.return_id,
      orderId: row.order_id,
      paymentId: row.payment_id,
      amountCents: Number(row.amount_cents),
      status: row.status,
      providerRefundId: row.provider_refund_id,
      attemptCount: row.attempt_count,
      lastError: row.last_error,
      createdAt: row.created_at.toISOString(),
      completedAt: row.completed_at?.toISOString() ?? null,
    };
  }

  async create(input: CreateReturnInput, client?: PoolClient) {
    const result = await this.getExecutor(client).query<ReturnRow>(
      `INSERT INTO returns (
         order_id, customer_id, reason, customer_note, photos, return_shipping_paid_by, refund_amount_cents
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        input.orderId,
        input.customerId,
        input.reason,
        input.customerNote ?? null,
        input.photos ?? null,
        input.returnShippingPaidBy,
        input.refundAmountCents,
      ],
    );
    const record = this.mapReturn(result.rows[0]);
    await this.recordStatus(record.id, null, "requested", "return_requested", null, client);
    return record;
  }

  async createItem(input: CreateReturnItemInput, client?: PoolClient) {
    const result = await this.getExecutor(client).query<ReturnItemRow>(
      `INSERT INTO return_items (return_id, order_item_id, quantity, unit_refund_cents)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [input.returnId, input.orderItemId, input.quantity, input.unitRefundCents],
    );
    return this.mapItem(result.rows[0]);
  }

  async findById(id: string, client?: PoolClient) {
    const result = await this.getExecutor(client).query<ReturnRow>(
      `SELECT * FROM returns WHERE id = $1`,
      [id],
    );
    return result.rows[0] ? this.mapReturn(result.rows[0]) : null;
  }

  async list(filter: { customerId?: string; status?: ReturnStatus } = {}, client?: PoolClient) {
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
    const result = await this.getExecutor(client).query<ReturnRow>(
      `SELECT * FROM returns
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY requested_at DESC
       LIMIT 100`,
      params,
    );
    return result.rows.map((row) => this.mapReturn(row));
  }

  async listItems(returnId: string, client?: PoolClient) {
    const result = await this.getExecutor(client).query<ReturnItemRow>(
      `SELECT * FROM return_items WHERE return_id = $1 ORDER BY id ASC`,
      [returnId],
    );
    return result.rows.map((row) => this.mapItem(row));
  }

  async listHistory(returnId: string, client?: PoolClient) {
    const result = await this.getExecutor(client).query<ReturnStatusHistoryRow>(
      `SELECT * FROM return_status_history WHERE return_id = $1 ORDER BY changed_at DESC`,
      [returnId],
    );
    return result.rows.map((row) => this.mapHistory(row));
  }

  async updateStatus(
    id: string,
    status: ReturnStatus,
    reason: string | null,
    changedBy: string | null,
    extra: { adminNote?: string | null; rejectedReason?: string | null; returnTrackingNumber?: string | null } = {},
    client?: PoolClient,
  ) {
    const current = await this.findById(id, client);
    if (!current) return null;
    const result = await this.getExecutor(client).query<ReturnRow>(
      `UPDATE returns SET
         status = $1,
         admin_note = COALESCE($2, admin_note),
         rejected_reason = COALESCE($3, rejected_reason),
         return_tracking_number = COALESCE($4, return_tracking_number),
         approved_at = CASE WHEN $1 = 'approved' THEN NOW() ELSE approved_at END,
         received_at = CASE WHEN $1 = 'received' THEN NOW() ELSE received_at END,
         refunded_at = CASE WHEN $1 = 'refunded' THEN NOW() ELSE refunded_at END
       WHERE id = $5
       RETURNING *`,
      [
        status,
        extra.adminNote ?? null,
        extra.rejectedReason ?? null,
        extra.returnTrackingNumber ?? null,
        id,
      ],
    );
    await this.recordStatus(id, current.status, status, reason, changedBy, client);
    return this.mapReturn(result.rows[0]);
  }

  async updateItemCondition(
    id: string,
    itemCondition: ReturnItemCondition,
    restockEligible: boolean,
    client?: PoolClient,
  ) {
    const result = await this.getExecutor(client).query<ReturnItemRow>(
      `UPDATE return_items
       SET item_condition = $1, restock_eligible = $2
       WHERE id = $3
       RETURNING *`,
      [itemCondition, restockEligible, id],
    );
    return result.rows[0] ? this.mapItem(result.rows[0]) : null;
  }

  async sumActiveReturnedQuantity(orderItemId: string, client?: PoolClient) {
    const result = await this.getExecutor(client).query<{ quantity: string }>(
      `SELECT COALESCE(SUM(ri.quantity), 0)::text AS quantity
       FROM return_items ri
       JOIN returns r ON r.id = ri.return_id
       WHERE ri.order_item_id = $1
         AND r.status NOT IN ('rejected', 'cancelled')`,
      [orderItemId],
    );
    return Number(result.rows[0]?.quantity ?? 0);
  }

  async createRefund(input: { returnId: string; orderId: string; paymentId: string; amountCents: number }, client?: PoolClient) {
    const result = await this.getExecutor(client).query<RefundRow>(
      `INSERT INTO refunds (return_id, order_id, payment_id, amount_cents)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [input.returnId, input.orderId, input.paymentId, input.amountCents],
    );
    return this.mapRefund(result.rows[0]);
  }

  async listPendingRefunds(client?: PoolClient) {
    const result = await this.getExecutor(client).query<
      RefundRow & { provider_transaction_id: string | null }
    >(
      `SELECT r.*, p.provider_transaction_id
       FROM refunds r
       JOIN payments p ON p.id = r.payment_id
       WHERE r.status IN ('pending', 'failed') AND r.attempt_count < 3
       ORDER BY r.created_at ASC
       LIMIT 20`,
    );
    return result.rows.map((row) => ({
      ...this.mapRefund(row),
      paymentProviderTransactionId: row.provider_transaction_id,
    }));
  }

  async markRefundProcessing(id: string, client?: PoolClient) {
    const result = await this.getExecutor(client).query<RefundRow>(
      `UPDATE refunds
       SET status = 'processing', attempt_count = attempt_count + 1, last_error = NULL
       WHERE id = $1
       RETURNING *`,
      [id],
    );
    return this.mapRefund(result.rows[0]);
  }

  async markRefundSucceeded(id: string, providerRefundId: string, client?: PoolClient) {
    const result = await this.getExecutor(client).query<RefundRow>(
      `UPDATE refunds
       SET status = 'succeeded', provider_refund_id = $1, completed_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [providerRefundId, id],
    );
    return this.mapRefund(result.rows[0]);
  }

  async markRefundFailed(id: string, error: string, client?: PoolClient) {
    const result = await this.getExecutor(client).query<RefundRow>(
      `UPDATE refunds
       SET status = 'failed', last_error = $1
       WHERE id = $2
       RETURNING *`,
      [error, id],
    );
    return this.mapRefund(result.rows[0]);
  }

  private async recordStatus(
    returnId: string,
    from: ReturnStatus | null,
    to: ReturnStatus,
    reason: string | null,
    changedBy: string | null,
    client?: PoolClient,
  ) {
    await this.getExecutor(client).query(
      `INSERT INTO return_status_history (return_id, from_status, to_status, reason, changed_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [returnId, from, to, reason, changedBy],
    );
  }
}
