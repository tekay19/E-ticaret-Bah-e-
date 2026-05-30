import { InvalidStateTransitionError } from "@bahce-shop/shared";
import type { OrderStatus } from "@bahce-shop/repositories";

const transitions: Record<OrderStatus, OrderStatus[]> = {
  pending_payment: ["paid", "cancelled"],
  paid: ["preparing", "cancelled"],
  preparing: ["shipped", "cancelled"],
  shipped: ["delivered"],
  delivered: ["completed"],
  completed: [],
  cancelled: [],
};

export class OrderStateMachine {
  static canTransition(from: OrderStatus, to: OrderStatus) {
    return transitions[from]?.includes(to) ?? false;
  }

  static assertTransition(from: OrderStatus, to: OrderStatus) {
    if (!this.canTransition(from, to)) {
      throw new InvalidStateTransitionError(from, to);
    }
  }
}
