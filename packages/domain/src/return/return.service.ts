import { withTransaction } from "@bahce-shop/db";
import {
  CustomerRepository,
  InventoryRepository,
  OrderRepository,
  ProductRepository,
  ReturnRepository,
  UserRepository,
  type ReturnRecord,
  type ReturnItemCondition,
  type ReturnReason,
  type ReturnStatus,
} from "@bahce-shop/repositories";
import { NotFoundError, ValidationError, env } from "@bahce-shop/shared";
import { createEmailQueue, createRefundProcessorQueue, createSmsNotificationQueue } from "@bahce-shop/workers";
import { ReturnStateMachine } from "./return-state-machine.js";

const returnableOrderStatuses = new Set(["delivered", "completed"]);

export class ReturnService {
  private readonly customers = new CustomerRepository();
  private readonly emailQueue = createEmailQueue();
  private readonly inventory = new InventoryRepository();
  private readonly orders = new OrderRepository();
  private readonly products = new ProductRepository();
  private readonly returns = new ReturnRepository();
  private readonly refundQueue = createRefundProcessorQueue();
  private readonly smsQueue = createSmsNotificationQueue();
  private readonly users = new UserRepository();

  async createForUser(input: {
    userId: string;
    orderId: string;
    reason: ReturnReason;
    customerNote?: string | null;
    photos?: string[] | null;
    items: Array<{ orderItemId: string; quantity: number }>;
  }) {
    const customer = await this.requireCustomer(input.userId);
    const order = await this.orders.findById(input.orderId);
    if (!order || order.customerId !== customer.id) {
      throw new NotFoundError("Siparis bulunamadi.");
    }
    if (!returnableOrderStatuses.has(order.status)) {
      throw new ValidationError("Sadece teslim edilmis siparisler icin iade talebi acilabilir.");
    }
    if (!order.returnWindowExpiresAt || new Date(order.returnWindowExpiresAt) < new Date()) {
      throw new ValidationError("Iade suresi dolmus.");
    }
    if (input.reason === "hasarli_kargo" && (input.photos?.length ?? 0) < 2) {
      throw new ValidationError("Hasarli kargo iadelerinde en az 2 fotograf zorunludur.");
    }

    const orderItems = await this.orders.listItems(order.id);
    const itemById = new Map(orderItems.map((item) => [item.id, item]));
    let refundAmountCents = input.reason === "hasarli_kargo" ? order.shippingCents : 0;
    const validatedItems: Array<{ orderItemId: string; quantity: number; unitRefundCents: number }> = [];

    for (const item of input.items) {
      const orderItem = itemById.get(item.orderItemId);
      if (!orderItem) {
        throw new ValidationError("Iade kalemi siparise ait degil.");
      }
      const product = await this.products.findReturnableByVariantId(orderItem.variantId);
      if (!product) {
        throw new NotFoundError("Urun bulunamadi.");
      }
      if (!product.isReturnable) {
        throw new ValidationError(`${product.productName} iade edilemez.`);
      }
      if (product.returnRules?.unopened_only && input.reason !== "hasarli_kargo") {
        throw new ValidationError(`${product.productName} sadece acilmamis paketle iade edilebilir.`);
      }

      const alreadyReturned = await this.returns.sumActiveReturnedQuantity(orderItem.id);
      if (item.quantity > orderItem.quantity - alreadyReturned) {
        throw new ValidationError("Iade miktari sipariste kalan iade edilebilir miktari asiyor.");
      }

      refundAmountCents += orderItem.unitPriceCents * item.quantity;
      validatedItems.push({
        orderItemId: orderItem.id,
        quantity: item.quantity,
        unitRefundCents: orderItem.unitPriceCents,
      });
    }

    return withTransaction(async (client) => {
      const created = await this.returns.create(
        {
          orderId: order.id,
          customerId: customer.id,
          reason: input.reason,
          customerNote: input.customerNote ?? null,
          photos: input.photos ?? null,
          returnShippingPaidBy: input.reason === "hasarli_kargo" ? "seller" : "customer",
          refundAmountCents,
        },
        client,
      );

      for (const item of validatedItems) {
        await this.returns.createItem({ returnId: created.id, ...item }, client);
      }

      return this.detailForRecord(created.id, client);
    });
  }

  async listForUser(userId: string, status?: ReturnStatus) {
    const customer = await this.requireCustomer(userId);
    return this.returns.list({ customerId: customer.id, status });
  }

  async detailForUser(userId: string, id: string) {
    const customer = await this.requireCustomer(userId);
    const record = await this.returns.findById(id);
    if (!record || record.customerId !== customer.id) {
      throw new NotFoundError("Iade kaydi bulunamadi.");
    }
    return this.detailForRecord(id);
  }

  async listAdmin(status?: ReturnStatus) {
    return this.returns.list({ status });
  }

  async detailForAdmin(id: string) {
    await this.requireReturn(id);
    return this.detailForRecord(id);
  }

  async cancelForUser(userId: string, id: string) {
    const customer = await this.requireCustomer(userId);
    const record = await this.returns.findById(id);
    if (!record || record.customerId !== customer.id) {
      throw new NotFoundError("Iade kaydi bulunamadi.");
    }
    ReturnStateMachine.assertTransition(record.status, "cancelled");
    return this.returns.updateStatus(id, "cancelled", "customer_cancelled", null);
  }

  async approve(id: string, changedBy: string, adminNote?: string | null) {
    const record = await this.requireReturn(id);
    ReturnStateMachine.assertTransition(record.status, "approved");
    const tracking = record.returnShippingPaidBy === "seller" ? `RET-${record.returnNumber}` : null;
    const updated = await this.returns.updateStatus(
      id,
      "approved",
      "admin_approved",
      changedBy,
      { adminNote: adminNote ?? null, returnTrackingNumber: tracking },
    );
    if (updated) await this.enqueueReturnEmail(updated, "Iade talebiniz onaylandi.");
    return updated;
  }

  async reject(id: string, changedBy: string, rejectedReason: string) {
    const record = await this.requireReturn(id);
    ReturnStateMachine.assertTransition(record.status, "rejected");
    const updated = await this.returns.updateStatus(id, "rejected", "admin_rejected", changedBy, { rejectedReason });
    if (updated) await this.enqueueReturnEmail(updated, rejectedReason);
    return updated;
  }

  async receive(
    id: string,
    changedBy: string,
    items: Array<{ returnItemId: string; itemCondition: ReturnItemCondition; restockEligible?: boolean }>,
  ) {
    const record = await this.requireReturn(id);
    if (record.status === "approved") {
      await this.returns.updateStatus(id, "in_transit", "return_in_transit", changedBy);
    } else {
      ReturnStateMachine.assertTransition(record.status, "received");
    }

    const returnItems = await this.returns.listItems(id);
    const payment = await this.orders.findPaymentByOrderId(record.orderId);
    if (!payment) {
      throw new NotFoundError("Odeme kaydi bulunamadi.");
    }

    const conditionById = new Map(items.map((item) => [item.returnItemId, item]));
    const refund = await withTransaction(async (client) => {
      for (const returnItem of returnItems) {
        const input = conditionById.get(returnItem.id);
        if (!input) {
          throw new ValidationError("Tum iade kalemleri icin durum bilgisi gonderilmelidir.");
        }
        const restockEligible = input.restockEligible ?? !["damaged", "missing"].includes(input.itemCondition);
        await this.returns.updateItemCondition(returnItem.id, input.itemCondition, restockEligible, client);

        const orderItem = await this.orders.findItemById(returnItem.orderItemId, client);
        if (!orderItem) {
          throw new NotFoundError("Siparis kalemi bulunamadi.");
        }
        await this.inventory.recordMovement(
          {
            variantId: orderItem.variantId,
            movementType: restockEligible ? "return" : "waste",
            quantity: returnItem.quantity,
            referenceType: "return",
            referenceId: record.id,
            reason: restockEligible ? "Iade stoklara alindi" : "Iade hasarli/eksik",
            createdBy: changedBy,
          },
          client,
        );
        if (restockEligible) {
          await this.inventory.adjustOnHand(orderItem.variantId, returnItem.quantity, client);
        }
      }

      await this.returns.updateStatus(id, "received", "return_received", changedBy, {}, client);
      return this.returns.createRefund(
        {
          returnId: record.id,
          orderId: record.orderId,
          paymentId: payment.id,
          amountCents: record.refundAmountCents ?? 0,
        },
        client,
      );
    });

    await this.refundQueue.add("process-refund", { refundId: refund.id });
    const detail = await this.detailForRecord(id);
    await this.enqueueReturnEmail(detail, "Iade urunleri teslim alindi, odeme iadesi baslatildi.");
    return detail;
  }

  async markRefunded(id: string) {
    const record = await this.requireReturn(id);
    ReturnStateMachine.assertTransition(record.status, "refunded");
    const updated = await this.returns.updateStatus(id, "refunded", "refund_succeeded", null);
    const order = await this.orders.findById(record.orderId);
    const customer = order ? await this.customers.findById(order.customerId) : null;
    if (customer?.phone) {
      await this.smsQueue.add("shipment-sms", {
        phone: customer.phone,
        orderId: record.orderId,
        trackingNumber: record.returnNumber,
        status: "delivered",
      });
    }
    if (updated) await this.enqueueRefundEmail(updated);
    return updated;
  }

  private async detailForRecord(id: string, client?: Parameters<ReturnRepository["findById"]>[1]) {
    const record = await this.returns.findById(id, client);
    if (!record) {
      throw new NotFoundError("Iade kaydi bulunamadi.");
    }
    return {
      ...record,
      items: await this.returns.listItems(id, client),
      history: await this.returns.listHistory(id, client),
    };
  }

  private async requireCustomer(userId: string) {
    const customer = await this.customers.findByUserId(userId);
    if (!customer) {
      throw new NotFoundError("Musteri kaydi bulunamadi.");
    }
    return customer;
  }

  private async requireReturn(id: string) {
    const record = await this.returns.findById(id);
    if (!record) {
      throw new NotFoundError("Iade kaydi bulunamadi.");
    }
    return record;
  }

  private async enqueueReturnEmail(record: ReturnRecord, message: string) {
    const customer = await this.customers.findById(record.customerId);
    const user = customer ? await this.users.findById(customer.userId) : null;
    if (!customer || !user) return;
    await this.emailQueue.add("return-status-updated", {
      to: user.email,
      template: "return-status-updated",
      vars: {
        customerName: customer.fullName,
        returnNumber: record.returnNumber,
        status: returnStatusLabel(record.status),
        message,
        returnUrl: `${env.APP_BASE_URL}/#returns`,
      },
    });
  }

  private async enqueueRefundEmail(record: ReturnRecord) {
    const customer = await this.customers.findById(record.customerId);
    const user = customer ? await this.users.findById(customer.userId) : null;
    if (!customer || !user) return;
    await this.emailQueue.add("refund-completed", {
      to: user.email,
      template: "refund-completed",
      vars: {
        customerName: customer.fullName,
        returnNumber: record.returnNumber,
        amount: formatCents(record.refundAmountCents ?? 0),
        returnUrl: `${env.APP_BASE_URL}/#returns`,
      },
    });
  }
}

function returnStatusLabel(status: ReturnStatus) {
  const labels: Record<ReturnStatus, string> = {
    requested: "Talep alindi",
    approved: "Onaylandi",
    rejected: "Reddedildi",
    in_transit: "Geri kargoda",
    received: "Teslim alindi",
    refunded: "Iade odendi",
    cancelled: "Iptal edildi",
  };
  return labels[status];
}

function formatCents(cents: number) {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(cents / 100);
}
