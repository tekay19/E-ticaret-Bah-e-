import { AsyncLocalStorage } from "node:async_hooks";
import pino from "pino";

export const requestContext = new AsyncLocalStorage<{ requestId: string }>();

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: {
    paths: [
      "password",
      "token",
      "creditCard",
      "headers.authorization",
      "req.headers.authorization",
    ],
    censor: "[redacted]",
  },
  mixin() {
    return {
      requestId: requestContext.getStore()?.requestId,
    };
  },
  transport:
    process.env.NODE_ENV === "development"
      ? {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:standard",
          },
        }
      : undefined,
});
