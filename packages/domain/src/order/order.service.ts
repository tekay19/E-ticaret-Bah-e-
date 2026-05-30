import { CustomerRepository, OrderRepository, UserRepository, type OrderRecord, type OrderStatus } from "@bahce-shop/repositories";
import { NotFoundError, env } from "@bahce-shop/shared";
import { createEmailQueue } from "@bahce-shop/workers";
import { ReservationService } from "../inventory/reservation.service.js";
import { OrderStateMachine } from "./order-state-machine.js";

export class OrderService {
  private readonly orders = new OrderRepository();
  private readonly customers = new CustomerRepository();
  private readonly emailQueue = createEmailQueue();
  private readonly reservations = new ReservationService();
  private readonly users = new UserRepository();

  async listForUser(userId: string) {
    const customer = await this.customers.findByUserId(userId);
    if (!customer) {
      throw new NotFoundError("Musteri kaydi bulunamadi.");
    }
    const orders = await this.orders.list({ customerId: customer.id });
    return Promise.all(orders.map(async (order) => ({
      ...order,
      items: await this.orders.listItems(order.id),
    })));
  }

  async listForCustomer(customerId: string) {
    return this.orders.list({ customerId });
  }

  async listAdmin(filter: { status?: OrderStatus; customerId?: string; from?: string; to?: string }) {
    const orders = await this.orders.list(filter);
    return Promise.all(orders.map(async (order) => ({
      ...order,
      customer: await this.customers.findById(order.customerId),
      items: await this.orders.listItems(order.id),
    })));
  }

  async detail(id: string) {
    const order = await this.orders.findById(id);
    if (!order) {
      throw new NotFoundError("Siparis bulunamadi.");
    }

    return {
      ...order,
      customer: await this.customers.findById(order.customerId),
      items: await this.orders.listItems(id),
      payment: await this.orders.findPaymentByOrderId(id),
      history: await this.orders.listStatusHistory(id),
    };
  }

  async detailForUser(userId: string, id: string) {
    const customer = await this.customers.findByUserId(userId);
    if (!customer) {
      throw new NotFoundError("Musteri kaydi bulunamadi.");
    }
    const order = await this.orders.findById(id);
    if (!order || order.customerId !== customer.id) {
      throw new NotFoundError("Siparis bulunamadi.");
    }
    return this.detail(id);
  }

  async transition(id: string, to: OrderStatus, reason: string | null, changedBy: string | null) {
    const order = await this.orders.findById(id);
    if (!order) {
      throw new NotFoundError("Siparis bulunamadi.");
    }

    OrderStateMachine.assertTransition(order.status, to);
    const updated = await this.orders.updateStatus(id, to, reason, changedBy);
    if (updated) await this.enqueueOrderStatusEmail(updated);
    return updated;
  }

  async cancel(id: string, changedBy: string | null) {
    const order = await this.transition(id, "cancelled", "customer_cancelled", changedBy);
    const items = await this.orders.listItems(id);
    for (const item of items) {
      await this.reservations.release(item.reservationRef);
    }
    return order;
  }

  async cancelForUser(userId: string, id: string) {
    await this.detailForUser(userId, id);
    return this.cancel(id, userId);
  }

  async updateNote(id: string, internalNote: string) {
    const order = await this.orders.updateNote(id, internalNote);
    if (!order) {
      throw new NotFoundError("Siparis bulunamadi.");
    }

    return order;
  }

  private async enqueueOrderStatusEmail(order: OrderRecord) {
    const customer = await this.customers.findById(order.customerId);
    const user = customer ? await this.users.findById(customer.userId) : null;
    if (!customer || !user) return;
    await this.emailQueue.add("order-status-updated", {
      to: user.email,
      template: "order-status-updated",
      vars: {
        customerName: customer.fullName,
        orderNumber: order.orderNumber,
        status: orderStatusLabel(order.status),
        orderUrl: `${env.APP_BASE_URL}/#orders`,
      },
    });
  }
}

function orderStatusLabel(status: OrderStatus) {
  const labels: Record<OrderStatus, string> = {
    pending_payment: "Odeme bekliyor",
    paid: "Odendi",
    preparing: "Hazirlaniyor",
    shipped: "Kargoda",
    delivered: "Teslim edildi",
    completed: "Tamamlandi",
    cancelled: "Iptal edildi",
  };
  return labels[status];
}
