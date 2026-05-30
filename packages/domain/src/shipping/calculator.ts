import { pool } from "@bahce-shop/db";
import { ProductRepository } from "@bahce-shop/repositories";
import type { Cart } from "../cart/types.js";

type CarrierRateRow = {
  carrier_code: "aras" | "mng" | "yurtici" | "ptt";
  price_cents: string;
};

export class ShippingCalculator {
  private readonly products = new ProductRepository();

  async calculate(cart: Cart) {
    let totalDesi = 0;
    let totalWeightKg = 0;
    let hasHazardous = false;

    for (const item of cart.items) {
      const variant = await this.products.findCartVariantById(item.variantId);
      if (!variant) {
        continue;
      }

      totalDesi += Number(variant.volumeDesi ?? 0) * item.qty;
      totalWeightKg += Number(variant.weightKg ?? 0) * item.qty;
      hasHazardous ||= variant.isHazardous;
    }

    const effectiveDesi = Math.max(totalDesi, totalWeightKg / 3);
    const result = await pool.query<CarrierRateRow>(
      `SELECT carrier_code, price_cents
       FROM carrier_rates
       WHERE is_active = TRUE
         AND valid_from <= CURRENT_DATE
         AND (valid_to IS NULL OR valid_to >= CURRENT_DATE)
         AND $1 BETWEEN min_desi AND max_desi
       ORDER BY price_cents ASC`,
      [effectiveDesi],
    );

    return result.rows
      .filter((row) => !(hasHazardous && row.carrier_code === "ptt"))
      .map((row) => ({
        carrier: row.carrier_code,
        estimatedDays: row.carrier_code === "ptt" ? 4 : 2,
        priceCents: Number(row.price_cents),
      }));
  }
}
