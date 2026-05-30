import { withTransaction } from "@bahce-shop/db";
import { IyzicoClient } from "@bahce-shop/integrations";
import {
  CustomerRepository,
  OrderRepository,
  ProductRepository,
} from "@bahce-shop/repositories";
import { NotFoundError, ValidationError, env } from "@bahce-shop/shared";
import {
  createEfaturaQueue,
  createOrderConfirmationQueue,
} from "@bahce-shop/workers";
import { CartRepository } from "../cart/cart.repository.js";
import { CouponService } from "../coupon/coupon.service.js";
import { ReservationService } from "../inventory/reservation.service.js";
import { OrderStateMachine } from "./order-state-machine.js";

export class CheckoutService {
  private readonly carts = new CartRepository();
  private readonly coupons = new CouponService();
  private readonly customers = new CustomerRepository();
  private readonly orders = new OrderRepository();
  private readonly products = new ProductRepository();
  private readonly reservations = new ReservationService();
  private readonly iyzico = new IyzicoClient();
  private readonly confirmationQueue = createOrderConfirmationQueue();
  private readonly efaturaQueue = createEfaturaQueue();

  async initiate(input: {
    userId: string;
    idempotencyKey?: string;
    cartId?: string;
    shippingAddress: Record<string, unknown>;
    billingAddress?: Record<string, unknown> | null;
    carrierCode: string;
    shippingCents: number;
    customerNote?: string | null;
  }) {
    if (input.idempotencyKey) {
      const cached = await this.orders.getIdempotency(input.idempotencyKey, "checkout:initiate");
      if (cached?.response_body) {
        return cached.response_body;
      }
    }

    const customer = await this.customers.findByUserId(input.userId);
    if (!customer) {
      throw new NotFoundError("Musteri kaydi bulunamadi.");
    }

    const cartId = input.cartId ?? await this.carts.findUserCartId(input.userId);
    if (!cartId) {
      throw new ValidationError("Sepet bulunamadi.");
    }

    const cart = await this.carts.get(cartId);
    if (!cart || cart.items.length === 0) {
      throw new ValidationError("Sepet bos.");
    }

    const subtotalCents = cart.items.reduce((sum, item) => sum + item.unitPriceCents * item.qty, 0);
    const couponResult = cart.appliedCouponCode
      ? await this.coupons.validate({
          code: cart.appliedCouponCode,
          subtotalCents,
          customerId: customer.id,
        })
      : null;
    const discountCents = couponResult?.discountCents ?? 0;
    const taxCents = 0;
    const totalCents = subtotalCents - discountCents + input.shippingCents + taxCents;

    const order = await withTransaction(async (client) => {
      const createdOrder = await this.orders.create(
        {
          cartId: cart.cartId,
          customerId: customer.id,
          subtotalCents,
          discountCents,
          shippingCents: input.shippingCents,
          taxCents,
          totalCents,
          shippingAddress: input.shippingAddress,
          billingAddress: input.billingAddress ?? null,
          carrierCode: input.carrierCode,
          couponCode: cart.appliedCouponCode,
          customerNote: input.customerNote ?? null,
        },
        client,
      );

      for (const item of cart.items) {
        const variant = await this.products.findCartVariantById(item.variantId, client);
        if (!variant) {
          throw new NotFoundError("Varyant bulunamadi.");
        }

        await this.orders.createItem(
          {
            orderId: createdOrder.id,
            variantId: item.variantId,
            reservationRef: item.reservationRef,
            quantity: item.qty,
            unitPriceCents: item.unitPriceCents,
            totalCents: item.unitPriceCents * item.qty,
            productSnapshot: {
              name: item.productName,
              slug: item.productSlug,
            },
            variantSnapshot: {
              sku: item.variantSku,
              options: variant.options,
            },
          },
          client,
        );
      }

      return createdOrder;
    });

    const checkout = await this.iyzico.initializeCheckout({
      orderId: order.id,
      orderNumber: order.orderNumber,
      amountCents: order.totalCents,
      callbackUrl: `${env.APP_BASE_URL}/checkout/confirm`,
    });
    await this.orders.createPayment({
      orderId: order.id,
      token: checkout.token,
      amountCents: order.totalCents,
      rawResponse: checkout.rawResponse,
    });

    const response = {
      orderId: order.id,
      orderNumber: order.orderNumber,
      paymentPageUrl: checkout.paymentPageUrl,
      token: checkout.token,
    };

    if (input.idempotencyKey) {
      await this.orders.saveIdempotency(input.idempotencyKey, "checkout:initiate", 200, response);
    }

    return response;
  }

  async confirm(token: string) {
    const payment = await this.orders.findPaymentByToken(token);
    if (!payment) {
      throw new NotFoundError("Odeme kaydi bulunamadi.");
    }

    const order = await this.orders.findById(payment.orderId);
    if (!order) {
      throw new NotFoundError("Siparis bulunamadi.");
    }

    const result = await this.iyzico.retrieveCheckoutResult(token);

    if (result.status === "failed") {
      OrderStateMachine.assertTransition(order.status, "cancelled");
      await this.orders.markPayment(payment.id, "failed", result.rawResponse, result.providerTransactionId);
      await this.orders.updateStatus(order.id, "cancelled", "payment_failed", null);
      await this.releaseOrderReservations(order.id);
      return { status: "failed", orderId: order.id };
    }

    OrderStateMachine.assertTransition(order.status, "paid");
    await this.orders.markPayment(payment.id, "succeeded", result.rawResponse, result.providerTransactionId);
    const paidOrder = await this.orders.updateStatus(order.id, "paid", "payment_succeeded", null);
    if (order.couponCode && order.discountCents > 0) {
      await this.coupons.redeem({
        code: order.couponCode,
        subtotalCents: order.subtotalCents,
        customerId: order.customerId,
        orderId: order.id,
      });
    }
    await this.commitOrderReservations(order.id);
    await this.confirmationQueue.add("order-confirmation", { orderId: order.id });
    await this.efaturaQueue.add("efatura", { orderId: order.id });
    if (order.cartId) {
      await this.carts.delete(order.cartId);
    }

    return {
      status: "succeeded",
      order: paidOrder
        ? {
            ...paidOrder,
            items: await this.orders.listItems(order.id),
            payment: await this.orders.findPaymentByOrderId(order.id),
            history: await this.orders.listStatusHistory(order.id),
          }
        : paidOrder,
    };
  }

  private async commitOrderReservations(orderId: string) {
    const items = await this.orders.listItems(orderId);
    for (const item of items) {
      await this.reservations.completeOrderReservation(item.reservationRef);
    }
  }

  private async releaseOrderReservations(orderId: string) {
    const items = await this.orders.listItems(orderId);
    for (const item of items) {
      await this.reservations.release(item.reservationRef);
    }
  }
}
