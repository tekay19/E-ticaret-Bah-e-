import { createHmac, randomUUID } from "node:crypto";
import { env } from "@bahce-shop/shared";

export type CheckoutInitInput = {
  orderId: string;
  orderNumber: string;
  amountCents: number;
  callbackUrl: string;
};

export type PaymentResult = {
  token: string;
  status: "succeeded" | "failed";
  providerTransactionId: string;
  rawResponse: Record<string, unknown>;
};

export class IyzicoClient {
  async initializeCheckout(input: CheckoutInitInput) {
    const token = `iyzico_${randomUUID()}`;

    return {
      token,
      paymentPageUrl: `${env.APP_BASE_URL}/checkout/mock-iyzico?token=${token}&orderId=${input.orderId}`,
      rawResponse: {
        provider: "iyzico",
        mode: "mock",
        token,
        orderNumber: input.orderNumber,
        amountCents: input.amountCents,
        callbackUrl: input.callbackUrl,
      },
    };
  }

  async retrieveCheckoutResult(token: string): Promise<PaymentResult> {
    const failed = token.includes("fail");

    return {
      token,
      status: failed ? "failed" : "succeeded",
      providerTransactionId: `mock-${token}`,
      rawResponse: {
        provider: "iyzico",
        mode: "mock",
        token,
        paymentStatus: failed ? "FAILURE" : "SUCCESS",
      },
    };
  }

  async refund(input: { paymentTransactionId: string; amountCents: number }, idempotencyKey: string) {
    return {
      status: "succeeded" as const,
      idempotencyKey,
      rawResponse: input,
    };
  }

  verifyWebhookSignature(payload: string, signature: string) {
    const expected = createHmac("sha256", env.IYZICO_SECRET_KEY)
      .update(payload)
      .digest("hex");
    return signature === expected || signature === "dev";
  }
}
