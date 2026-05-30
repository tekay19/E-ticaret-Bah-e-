import type { PoolClient } from "pg";
import { pool } from "@bahce-shop/db";
import type { CouponRecord, CouponRedemptionRecord, DiscountType } from "./types.js";

type Queryable = PoolClient | typeof pool;

type CouponRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  discount_type: DiscountType;
  discount_value: number;
  max_discount_cents: string | null;
  min_subtotal_cents: string;
  usage_limit: number | null;
  per_customer_limit: number | null;
  starts_at: Date | null;
  ends_at: Date | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
};

type RedemptionRow = {
  id: string;
  coupon_id: string;
  order_id: string;
  customer_id: string;
  discount_cents: string;
  redeemed_at: Date;
};

export type CreateCouponInput = {
  code: string;
  name: string;
  description?: string | null;
  discountType: DiscountType;
  discountValue: number;
  maxDiscountCents?: number | null;
  minSubtotalCents?: number;
  usageLimit?: number | null;
  perCustomerLimit?: number | null;
  startsAt?: string | null;
  endsAt?: string | null;
  isActive?: boolean;
};

export class CouponRepository {
  private getExecutor(client?: PoolClient): Queryable {
    return client ?? pool;
  }

  private mapCoupon(row: CouponRow): CouponRecord {
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      description: row.description,
      discountType: row.discount_type,
      discountValue: row.discount_value,
      maxDiscountCents: row.max_discount_cents === null ? null : Number(row.max_discount_cents),
      minSubtotalCents: Number(row.min_subtotal_cents),
      usageLimit: row.usage_limit,
      perCustomerLimit: row.per_customer_limit,
      startsAt: row.starts_at?.toISOString() ?? null,
      endsAt: row.ends_at?.toISOString() ?? null,
      isActive: row.is_active,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  private mapRedemption(row: RedemptionRow): CouponRedemptionRecord {
    return {
      id: row.id,
      couponId: row.coupon_id,
      orderId: row.order_id,
      customerId: row.customer_id,
      discountCents: Number(row.discount_cents),
      redeemedAt: row.redeemed_at.toISOString(),
    };
  }

  async create(input: CreateCouponInput, client?: PoolClient) {
    const result = await this.getExecutor(client).query<CouponRow>(
      `INSERT INTO coupons (
         code, name, description, discount_type, discount_value, max_discount_cents,
         min_subtotal_cents, usage_limit, per_customer_limit, starts_at, ends_at, is_active
       )
       VALUES (UPPER($1), $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (code) DO UPDATE SET
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         discount_type = EXCLUDED.discount_type,
         discount_value = EXCLUDED.discount_value,
         max_discount_cents = EXCLUDED.max_discount_cents,
         min_subtotal_cents = EXCLUDED.min_subtotal_cents,
         usage_limit = EXCLUDED.usage_limit,
         per_customer_limit = EXCLUDED.per_customer_limit,
         starts_at = EXCLUDED.starts_at,
         ends_at = EXCLUDED.ends_at,
         is_active = EXCLUDED.is_active,
         updated_at = NOW()
       RETURNING *`,
      [
        input.code.trim(),
        input.name,
        input.description ?? null,
        input.discountType,
        input.discountValue,
        input.maxDiscountCents ?? null,
        input.minSubtotalCents ?? 0,
        input.usageLimit ?? null,
        input.perCustomerLimit ?? null,
        input.startsAt ?? null,
        input.endsAt ?? null,
        input.isActive ?? true,
      ],
    );
    return this.mapCoupon(result.rows[0]);
  }

  async findByCode(code: string, client?: PoolClient) {
    const result = await this.getExecutor(client).query<CouponRow>(
      `SELECT * FROM coupons WHERE code = UPPER($1)`,
      [code.trim()],
    );
    return result.rows[0] ? this.mapCoupon(result.rows[0]) : null;
  }

  async findById(id: string, client?: PoolClient) {
    const result = await this.getExecutor(client).query<CouponRow>(
      `SELECT * FROM coupons WHERE id = $1`,
      [id],
    );
    return result.rows[0] ? this.mapCoupon(result.rows[0]) : null;
  }

  async list(client?: PoolClient) {
    const result = await this.getExecutor(client).query<CouponRow>(
      `SELECT * FROM coupons ORDER BY created_at DESC LIMIT 100`,
    );
    return result.rows.map((row) => this.mapCoupon(row));
  }

  async update(id: string, input: Partial<CreateCouponInput>, client?: PoolClient) {
    const current = await this.findById(id, client);
    if (!current) return null;

    const result = await this.getExecutor(client).query<CouponRow>(
      `UPDATE coupons SET
         code = UPPER($2),
         name = $3,
         description = $4,
         discount_type = $5,
         discount_value = $6,
         max_discount_cents = $7,
         min_subtotal_cents = $8,
         usage_limit = $9,
         per_customer_limit = $10,
         starts_at = $11,
         ends_at = $12,
         is_active = $13,
         updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [
        id,
        input.code?.trim() ?? current.code,
        input.name ?? current.name,
        input.description === undefined ? current.description : input.description,
        input.discountType ?? current.discountType,
        input.discountValue ?? current.discountValue,
        input.maxDiscountCents === undefined ? current.maxDiscountCents : input.maxDiscountCents,
        input.minSubtotalCents ?? current.minSubtotalCents,
        input.usageLimit === undefined ? current.usageLimit : input.usageLimit,
        input.perCustomerLimit === undefined ? current.perCustomerLimit : input.perCustomerLimit,
        input.startsAt === undefined ? current.startsAt : input.startsAt,
        input.endsAt === undefined ? current.endsAt : input.endsAt,
        input.isActive ?? current.isActive,
      ],
    );
    return this.mapCoupon(result.rows[0]);
  }

  async setActive(id: string, isActive: boolean, client?: PoolClient) {
    const result = await this.getExecutor(client).query<CouponRow>(
      `UPDATE coupons SET is_active = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id, isActive],
    );
    return result.rows[0] ? this.mapCoupon(result.rows[0]) : null;
  }

  async delete(id: string, client?: PoolClient) {
    const result = await this.getExecutor(client).query<{ id: string }>(
      `DELETE FROM coupons WHERE id = $1 RETURNING id`,
      [id],
    );
    return Boolean(result.rows[0]);
  }

  async countRedemptions(couponId: string, client?: PoolClient) {
    const result = await this.getExecutor(client).query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM coupon_redemptions WHERE coupon_id = $1`,
      [couponId],
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  async countRedemptionsForCustomer(couponId: string, customerId: string, client?: PoolClient) {
    const result = await this.getExecutor(client).query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM coupon_redemptions
       WHERE coupon_id = $1 AND customer_id = $2`,
      [couponId, customerId],
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  async recordRedemption(input: {
    couponId: string;
    orderId: string;
    customerId: string;
    discountCents: number;
  }, client?: PoolClient) {
    const result = await this.getExecutor(client).query<RedemptionRow>(
      `INSERT INTO coupon_redemptions (coupon_id, order_id, customer_id, discount_cents)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (coupon_id, order_id) DO NOTHING
       RETURNING *`,
      [input.couponId, input.orderId, input.customerId, input.discountCents],
    );
    return result.rows[0] ? this.mapRedemption(result.rows[0]) : null;
  }
}
