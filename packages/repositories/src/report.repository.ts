import { pool } from "@bahce-shop/db";

const REVENUE_STATUSES = ["paid", "preparing", "shipped", "delivered", "completed"];

type DateRange = {
  from?: string;
  to?: string;
};

type RangeParts = {
  whereSql: string;
  params: unknown[];
};

function buildRangeWhere(column: string, range: DateRange, startIndex = 1): RangeParts {
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (range.from) {
    params.push(range.from);
    clauses.push(`${column} >= $${startIndex + params.length - 1}`);
  }
  if (range.to) {
    params.push(range.to);
    clauses.push(`${column} <= $${startIndex + params.length - 1}`);
  }

  return {
    whereSql: clauses.length ? `AND ${clauses.join(" AND ")}` : "",
    params,
  };
}

function numberValue(value: string | number | null | undefined) {
  return Number(value ?? 0);
}

export class ReportRepository {
  async overview(range: DateRange) {
    const orderRange = buildRangeWhere("created_at", range, 2);
    const refundRange = buildRangeWhere("created_at", range);
    const customerRange = buildRangeWhere("created_at", range);

    const [orders, refunds, customers, lowStock] = await Promise.all([
      pool.query<{
        total_orders: string;
        revenue_orders: string;
        pending_orders: string;
        cancelled_orders: string;
        gross_sales_cents: string | null;
        discount_cents: string | null;
        net_sales_cents: string | null;
        avg_order_value_cents: string | null;
      }>(
        `SELECT
           COUNT(*)::int AS total_orders,
           COUNT(*) FILTER (WHERE status = ANY($1))::int AS revenue_orders,
           COUNT(*) FILTER (WHERE status = 'pending_payment')::int AS pending_orders,
           COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled_orders,
           COALESCE(SUM(total_cents) FILTER (WHERE status = ANY($1)), 0) AS gross_sales_cents,
           COALESCE(SUM(discount_cents) FILTER (WHERE status = ANY($1)), 0) AS discount_cents,
           COALESCE(SUM(total_cents - shipping_cents - tax_cents) FILTER (WHERE status = ANY($1)), 0) AS net_sales_cents,
           COALESCE(AVG(total_cents) FILTER (WHERE status = ANY($1)), 0) AS avg_order_value_cents
         FROM orders
         WHERE TRUE ${orderRange.whereSql}`,
        [REVENUE_STATUSES, ...orderRange.params],
      ),
      pool.query<{ refund_count: string; refund_amount_cents: string | null }>(
        `SELECT
           COUNT(*) FILTER (WHERE status = 'succeeded')::int AS refund_count,
           COALESCE(SUM(amount_cents) FILTER (WHERE status = 'succeeded'), 0) AS refund_amount_cents
         FROM refunds
         WHERE TRUE ${refundRange.whereSql}`,
        refundRange.params,
      ),
      pool.query<{ new_customers: string }>(
        `SELECT COUNT(*)::int AS new_customers
         FROM customers
         WHERE TRUE ${customerRange.whereSql}`,
        customerRange.params,
      ),
      pool.query<{ low_stock_count: string; out_of_stock_count: string }>(
        `SELECT
           COUNT(*) FILTER (WHERE i.available <= p.min_stock_alert AND p.is_active = TRUE)::int AS low_stock_count,
           COUNT(*) FILTER (WHERE i.available <= 0 AND p.is_active = TRUE)::int AS out_of_stock_count
         FROM inventory i
         JOIN product_variants pv ON pv.id = i.variant_id
         JOIN products p ON p.id = pv.product_id`,
      ),
    ]);

    const orderRow = orders.rows[0];
    const refundRow = refunds.rows[0];
    const customerRow = customers.rows[0];
    const stockRow = lowStock.rows[0];

    return {
      totalOrders: numberValue(orderRow.total_orders),
      revenueOrders: numberValue(orderRow.revenue_orders),
      pendingOrders: numberValue(orderRow.pending_orders),
      cancelledOrders: numberValue(orderRow.cancelled_orders),
      grossSalesCents: numberValue(orderRow.gross_sales_cents),
      discountCents: numberValue(orderRow.discount_cents),
      netSalesCents: numberValue(orderRow.net_sales_cents),
      avgOrderValueCents: Math.round(numberValue(orderRow.avg_order_value_cents)),
      refundCount: numberValue(refundRow.refund_count),
      refundAmountCents: numberValue(refundRow.refund_amount_cents),
      newCustomers: numberValue(customerRow.new_customers),
      lowStockCount: numberValue(stockRow.low_stock_count),
      outOfStockCount: numberValue(stockRow.out_of_stock_count),
    };
  }

  async sales(range: DateRange) {
    const orderRange = buildRangeWhere("o.created_at", range, 2);
    const result = await pool.query<{
      day: Date;
      order_count: string;
      gross_sales_cents: string | null;
      discount_cents: string | null;
      shipping_cents: string | null;
      net_sales_cents: string | null;
    }>(
      `SELECT
         date_trunc('day', o.created_at) AS day,
         COUNT(*)::int AS order_count,
         COALESCE(SUM(o.total_cents), 0) AS gross_sales_cents,
         COALESCE(SUM(o.discount_cents), 0) AS discount_cents,
         COALESCE(SUM(o.shipping_cents), 0) AS shipping_cents,
         COALESCE(SUM(o.total_cents - o.shipping_cents - o.tax_cents), 0) AS net_sales_cents
       FROM orders o
       WHERE o.status = ANY($1) ${orderRange.whereSql}
       GROUP BY 1
       ORDER BY 1 ASC`,
      [REVENUE_STATUSES, ...orderRange.params],
    );

    return result.rows.map((row) => ({
      day: row.day.toISOString().slice(0, 10),
      orderCount: numberValue(row.order_count),
      grossSalesCents: numberValue(row.gross_sales_cents),
      discountCents: numberValue(row.discount_cents),
      shippingCents: numberValue(row.shipping_cents),
      netSalesCents: numberValue(row.net_sales_cents),
    }));
  }

  async topProducts(range: DateRange, limit: number) {
    const orderRange = buildRangeWhere("o.created_at", range, 3);
    const result = await pool.query<{
      product_id: string;
      product_name: string;
      sku: string;
      quantity_sold: string;
      gross_sales_cents: string | null;
    }>(
      `SELECT
         p.id AS product_id,
         p.name AS product_name,
         pv.sku,
         COALESCE(SUM(oi.quantity), 0)::int AS quantity_sold,
         COALESCE(SUM(oi.total_cents), 0) AS gross_sales_cents
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       JOIN product_variants pv ON pv.id = oi.variant_id
       JOIN products p ON p.id = pv.product_id
       WHERE o.status = ANY($1) ${orderRange.whereSql}
       GROUP BY p.id, p.name, pv.sku
       ORDER BY quantity_sold DESC, gross_sales_cents DESC
       LIMIT $2`,
      [REVENUE_STATUSES, limit, ...orderRange.params],
    );

    return result.rows.map((row) => ({
      productId: row.product_id,
      productName: row.product_name,
      sku: row.sku,
      quantitySold: numberValue(row.quantity_sold),
      grossSalesCents: numberValue(row.gross_sales_cents),
    }));
  }

  async inventoryRisk(limit: number) {
    const result = await pool.query<{
      product_id: string;
      product_name: string;
      variant_id: string;
      sku: string;
      on_hand: number;
      reserved: number;
      available: number;
      min_stock_alert: number;
    }>(
      `SELECT
         p.id AS product_id,
         p.name AS product_name,
         pv.id AS variant_id,
         pv.sku,
         i.on_hand,
         i.reserved,
         i.available,
         p.min_stock_alert
       FROM inventory i
       JOIN product_variants pv ON pv.id = i.variant_id
       JOIN products p ON p.id = pv.product_id
       WHERE i.available <= p.min_stock_alert AND p.is_active = TRUE
       ORDER BY i.available ASC, p.name ASC
       LIMIT $1`,
      [limit],
    );

    return result.rows.map((row) => ({
      productId: row.product_id,
      productName: row.product_name,
      variantId: row.variant_id,
      sku: row.sku,
      onHand: row.on_hand,
      reserved: row.reserved,
      available: row.available,
      minStockAlert: row.min_stock_alert,
    }));
  }

  async couponPerformance(range: DateRange, limit: number) {
    const redemptionRange = buildRangeWhere("cr.redeemed_at", range, 2);
    const result = await pool.query<{
      code: string;
      name: string;
      is_active: boolean;
      redemption_count: string;
      discount_cents: string | null;
      order_total_cents: string | null;
    }>(
      `SELECT
         c.code,
         c.name,
         c.is_active,
         COUNT(cr.id)::int AS redemption_count,
         COALESCE(SUM(cr.discount_cents), 0) AS discount_cents,
         COALESCE(SUM(o.total_cents), 0) AS order_total_cents
       FROM coupons c
       LEFT JOIN coupon_redemptions cr ON cr.coupon_id = c.id ${redemptionRange.whereSql.replace("AND", "AND")}
       LEFT JOIN orders o ON o.id = cr.order_id
       GROUP BY c.id, c.code, c.name, c.is_active
       ORDER BY redemption_count DESC, discount_cents DESC, c.created_at DESC
       LIMIT $1`,
      [limit, ...redemptionRange.params],
    );

    return result.rows.map((row) => ({
      code: row.code,
      name: row.name,
      isActive: row.is_active,
      redemptionCount: numberValue(row.redemption_count),
      discountCents: numberValue(row.discount_cents),
      orderTotalCents: numberValue(row.order_total_cents),
    }));
  }
}
