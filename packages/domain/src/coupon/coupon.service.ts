import { CouponRepository, CustomerRepository, type CouponRecord } from "@bahce-shop/repositories";
import { NotFoundError, ValidationError } from "@bahce-shop/shared";
import type { Cart } from "../cart/types.js";

export class CouponService {
  private readonly coupons = new CouponRepository();
  private readonly customers = new CustomerRepository();

  async create(input: Parameters<CouponRepository["create"]>[0]) {
    if (input.discountType === "percent" && input.discountValue > 100) {
      throw new ValidationError("Yuzde indirim 100'den buyuk olamaz.");
    }
    return this.coupons.create(input);
  }

  async list() {
    return this.coupons.list();
  }

  async get(id: string) {
    const coupon = await this.coupons.findById(id);
    if (!coupon) {
      throw new NotFoundError("Kupon bulunamadi.");
    }
    return coupon;
  }

  async update(id: string, input: Parameters<CouponRepository["update"]>[1]) {
    if (input.discountType === "percent" && input.discountValue && input.discountValue > 100) {
      throw new ValidationError("Yuzde indirim 100'den buyuk olamaz.");
    }
    const coupon = await this.coupons.update(id, input);
    if (!coupon) {
      throw new NotFoundError("Kupon bulunamadi.");
    }
    return coupon;
  }

  async setActive(id: string, isActive: boolean) {
    const coupon = await this.coupons.setActive(id, isActive);
    if (!coupon) {
      throw new NotFoundError("Kupon bulunamadi.");
    }
    return coupon;
  }

  async delete(id: string) {
    const coupon = await this.get(id);
    const usageCount = await this.coupons.countRedemptions(id);
    if (usageCount > 0) {
      return {
        coupon: await this.setActive(id, false),
        deleted: false,
        deactivated: true,
      };
    }
    await this.coupons.delete(coupon.id);
    return {
      coupon,
      deleted: true,
      deactivated: false,
    };
  }

  async validateCartCoupon(input: { code: string; cart: Cart; userId?: string | null }) {
    const customer = input.userId ? await this.customers.findByUserId(input.userId) : null;
    const subtotalCents = this.subtotal(input.cart);
    return this.validate({
      code: input.code,
      subtotalCents,
      customerId: customer?.id ?? null,
    });
  }

  async validate(input: { code: string; subtotalCents: number; customerId?: string | null }) {
    const coupon = await this.coupons.findByCode(input.code);
    if (!coupon) {
      throw new NotFoundError("Kupon bulunamadi.");
    }
    await this.assertUsable(coupon, input.subtotalCents, input.customerId ?? null);

    return {
      coupon,
      discountCents: this.calculateDiscount(coupon, input.subtotalCents),
      subtotalCents: input.subtotalCents,
    };
  }

  async redeem(input: { code: string; subtotalCents: number; customerId: string; orderId: string }) {
    const { coupon, discountCents } = await this.validate({
      code: input.code,
      subtotalCents: input.subtotalCents,
      customerId: input.customerId,
    });
    await this.coupons.recordRedemption({
      couponId: coupon.id,
      orderId: input.orderId,
      customerId: input.customerId,
      discountCents,
    });
    return { coupon, discountCents };
  }

  private async assertUsable(coupon: CouponRecord, subtotalCents: number, customerId: string | null) {
    const now = new Date();
    if (!coupon.isActive) {
      throw new ValidationError("Kupon aktif degil.");
    }
    if (coupon.startsAt && new Date(coupon.startsAt) > now) {
      throw new ValidationError("Kupon henuz baslamadi.");
    }
    if (coupon.endsAt && new Date(coupon.endsAt) < now) {
      throw new ValidationError("Kupon suresi dolmus.");
    }
    if (subtotalCents < coupon.minSubtotalCents) {
      throw new ValidationError("Sepet tutari kupon minimum tutarinin altinda.");
    }
    if (coupon.usageLimit !== null) {
      const count = await this.coupons.countRedemptions(coupon.id);
      if (count >= coupon.usageLimit) {
        throw new ValidationError("Kupon kullanim limiti dolmus.");
      }
    }
    if (customerId && coupon.perCustomerLimit !== null) {
      const count = await this.coupons.countRedemptionsForCustomer(coupon.id, customerId);
      if (count >= coupon.perCustomerLimit) {
        throw new ValidationError("Bu kuponu kullanma limitin dolmus.");
      }
    }
  }

  private calculateDiscount(coupon: CouponRecord, subtotalCents: number) {
    const rawDiscount =
      coupon.discountType === "percent"
        ? Math.floor((subtotalCents * coupon.discountValue) / 100)
        : coupon.discountValue;
    const capped = coupon.maxDiscountCents === null ? rawDiscount : Math.min(rawDiscount, coupon.maxDiscountCents);
    return Math.min(capped, subtotalCents);
  }

  private subtotal(cart: Cart) {
    return cart.items.reduce((sum, item) => sum + item.unitPriceCents * item.qty, 0);
  }
}
