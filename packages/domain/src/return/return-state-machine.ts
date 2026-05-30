import { InvalidStateTransitionError } from "@bahce-shop/shared";
import type { ReturnStatus } from "@bahce-shop/repositories";

const transitions: Record<ReturnStatus, ReturnStatus[]> = {
  requested: ["approved", "rejected", "cancelled"],
  approved: ["in_transit", "cancelled"],
  in_transit: ["received"],
  received: ["refunded"],
  refunded: [],
  rejected: [],
  cancelled: [],
};

export class ReturnStateMachine {
  static canTransition(from: ReturnStatus, to: ReturnStatus) {
    return transitions[from]?.includes(to) ?? false;
  }

  static assertTransition(from: ReturnStatus, to: ReturnStatus) {
    if (!this.canTransition(from, to)) {
      throw new InvalidStateTransitionError(from, to);
    }
  }
}
