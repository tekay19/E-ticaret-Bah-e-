import Fastify from "fastify";
import type { FastifyInstance, RawServerDefault } from "fastify";
import type { IncomingMessage, ServerResponse } from "node:http";
import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import { fileURLToPath } from "node:url";
import requestContextPlugin from "./plugins/request-context.js";
import errorHandlerPlugin from "./plugins/error-handler.js";
import auditLogPlugin from "./plugins/audit-log.js";
import authPlugin from "./plugins/auth.js";
import rateLimitPlugin from "./plugins/rate-limit.js";
import rbacPlugin from "./plugins/rbac.js";
import securityHeadersPlugin from "./plugins/security-headers.js";
import authRoutes from "./routes/auth.js";
import auditRoutes from "./routes/audit.js";
import cartRoutes from "./routes/cart.js";
import catalogRoutes from "./routes/catalog.js";
import checkoutRoutes from "./routes/checkout.js";
import couponRoutes from "./routes/coupons.js";
import customerEngagementRoutes from "./routes/customer-engagement.js";
import inventoryRoutes from "./routes/inventory.js";
import orderRoutes from "./routes/orders.js";
import reportRoutes from "./routes/reports.js";
import returnRoutes from "./routes/returns.js";
import arasWebhookRoutes from "./routes/webhooks-aras.js";
import iyzicoWebhookRoutes from "./routes/webhooks-iyzico.js";
import mngWebhookRoutes from "./routes/webhooks-mng.js";
import { closePool, pool } from "@bahce-shop/db";
import { env, logger } from "@bahce-shop/shared";
import {
  CsvImporterWorker,
  EfaturaWorker,
  EmailSenderWorker,
  ImageProcessorWorker,
  OrderConfirmationWorker,
  PaymentTimeoutWorker,
  ReservationCleanupWorker,
  RefundProcessorWorker,
  ReturnWindowCloserWorker,
  ShipmentPollingWorker,
  SmsNotificationWorker,
  StockSyncPgWorker,
  StockThresholdWorker,
  TEST_QUEUE_NAME,
  TestWorker,
  createCsvImporterQueue,
  createEfaturaQueue,
  createQueue,
  createEmailQueue,
  createImageProcessorQueue,
  createOrderConfirmationQueue,
  createPaymentTimeoutQueue,
  createReservationCleanupQueue,
  createRefundProcessorQueue,
  createRedisClient,
  createReturnWindowCloserQueue,
  createShipmentPollingQueue,
  createSmsNotificationQueue,
  createStockSyncQueue,
  createStockThresholdQueue,
} from "@bahce-shop/workers";

export async function buildServer(): Promise<
  FastifyInstance<RawServerDefault, IncomingMessage, ServerResponse, typeof logger>
> {
  const app = Fastify({
    loggerInstance: logger,
    disableRequestLogging: false,
  });
  const redis = createRedisClient("api-health");

  await app.register(requestContextPlugin);
  await app.register(securityHeadersPlugin);
  await app.register(errorHandlerPlugin);
  await app.register(cookie, {
    secret: env.COOKIE_SECRET,
  });
  await app.register(multipart);
  await app.register(authPlugin);
  await app.register(rbacPlugin);
  await app.register(rateLimitPlugin);
  await app.register(auditLogPlugin);
  await app.register(auditRoutes);
  await app.register(authRoutes);
  await app.register(cartRoutes);
  await app.register(catalogRoutes);
  await app.register(checkoutRoutes);
  await app.register(couponRoutes);
  await app.register(customerEngagementRoutes);
  await app.register(inventoryRoutes);
  await app.register(orderRoutes);
  await app.register(reportRoutes);
  await app.register(returnRoutes);
  await app.register(arasWebhookRoutes);
  await app.register(iyzicoWebhookRoutes);
  await app.register(mngWebhookRoutes);

  app.get("/health", async () => {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      version: env.APP_VERSION,
    };
  });

  app.get("/health/deep", async () => {
    await pool.query("SELECT 1");
    const redisPing = await redis.ping();

    return {
      status: "ok",
      checks: {
        database: "ok",
        redis: redisPing,
      },
      timestamp: new Date().toISOString(),
      version: env.APP_VERSION,
    };
  });

  app.addHook("onClose", async () => {
    await redis.quit();
  });

  return app;
}

export async function startServer() {
  const app = await buildServer();
  const worker = new TestWorker().start();
  const emailWorker = new EmailSenderWorker().start();
  const imageWorker = new ImageProcessorWorker().start();
  const csvWorker = new CsvImporterWorker().start();
  const paymentTimeoutWorker = new PaymentTimeoutWorker().start();
  const refundProcessorWorker = new RefundProcessorWorker().start();
  const returnWindowCloserWorker = new ReturnWindowCloserWorker().start();
  const orderConfirmationWorker = new OrderConfirmationWorker().start();
  const efaturaWorker = new EfaturaWorker().start();
  const shipmentPollingWorker = new ShipmentPollingWorker().start();
  const smsWorker = new SmsNotificationWorker().start();
  const stockSyncWorker = new StockSyncPgWorker().start();
  const cleanupWorker = new ReservationCleanupWorker().start();
  const thresholdWorker = new StockThresholdWorker().start();
  const queue = createQueue(TEST_QUEUE_NAME);
  const csvQueue = createCsvImporterQueue();
  const emailQueue = createEmailQueue();
  const imageQueue = createImageProcessorQueue();
  const paymentTimeoutQueue = createPaymentTimeoutQueue();
  const refundProcessorQueue = createRefundProcessorQueue();
  const returnWindowCloserQueue = createReturnWindowCloserQueue();
  const orderConfirmationQueue = createOrderConfirmationQueue();
  const efaturaQueue = createEfaturaQueue();
  const shipmentPollingQueue = createShipmentPollingQueue();
  const smsQueue = createSmsNotificationQueue();
  const stockSyncQueue = createStockSyncQueue();
  const cleanupQueue = createReservationCleanupQueue();
  const thresholdQueue = createStockThresholdQueue();

  try {
    await app.listen({
      host: "0.0.0.0",
      port: env.PORT,
    });

    logger.info(
      { queue: TEST_QUEUE_NAME, port: env.PORT },
      "api server started",
    );

    await queue.add(
      "boot-check",
      { createdAt: new Date().toISOString() },
      { removeOnComplete: 100, removeOnFail: 100 },
    );
    await cleanupQueue.add(
      "scheduled-cleanup",
      { requestedAt: new Date().toISOString() },
      { repeat: { every: 5 * 60 * 1000 }, jobId: "reservation-cleanup-5m" },
    );
    await thresholdQueue.add(
      "scheduled-threshold-check",
      { requestedAt: new Date().toISOString() },
      { repeat: { every: 60 * 60 * 1000 }, jobId: "stock-threshold-1h" },
    );
    await paymentTimeoutQueue.add(
      "scheduled-payment-timeout",
      { requestedAt: new Date().toISOString() },
      { repeat: { every: 5 * 60 * 1000 }, jobId: "payment-timeout-5m" },
    );
    await shipmentPollingQueue.add(
      "scheduled-shipment-polling",
      { requestedAt: new Date().toISOString() },
      { repeat: { every: 60 * 60 * 1000 }, jobId: "shipment-polling-1h" },
    );
    await returnWindowCloserQueue.add(
      "scheduled-return-window-closer",
      { requestedAt: new Date().toISOString() },
      { repeat: { every: 24 * 60 * 60 * 1000 }, jobId: "return-window-closer-1d" },
    );

    const shutdown = async (signal: NodeJS.Signals) => {
      logger.info({ signal }, "graceful shutdown started");

      await Promise.allSettled([
        app.close(),
        worker.close(),
        emailWorker.close(),
        imageWorker.close(),
        csvWorker.close(),
        paymentTimeoutWorker.close(),
        refundProcessorWorker.close(),
        returnWindowCloserWorker.close(),
        orderConfirmationWorker.close(),
        efaturaWorker.close(),
        shipmentPollingWorker.close(),
        smsWorker.close(),
        stockSyncWorker.close(),
        cleanupWorker.close(),
        thresholdWorker.close(),
        queue.close(),
        csvQueue.close(),
        emailQueue.close(),
        imageQueue.close(),
        paymentTimeoutQueue.close(),
        refundProcessorQueue.close(),
        returnWindowCloserQueue.close(),
        orderConfirmationQueue.close(),
        efaturaQueue.close(),
        shipmentPollingQueue.close(),
        smsQueue.close(),
        stockSyncQueue.close(),
        cleanupQueue.close(),
        thresholdQueue.close(),
      ]);
      await closePool();

      logger.info({ signal }, "graceful shutdown completed");
      process.exit(0);
    };

    for (const signal of ["SIGINT", "SIGTERM"] as const) {
      process.once(signal, () => {
        void shutdown(signal);
      });
    }
  } catch (error) {
    logger.error({ err: error }, "failed to start api server");
    await Promise.allSettled([
      worker.close(),
      emailWorker.close(),
      imageWorker.close(),
      csvWorker.close(),
      paymentTimeoutWorker.close(),
      refundProcessorWorker.close(),
      returnWindowCloserWorker.close(),
      orderConfirmationWorker.close(),
      efaturaWorker.close(),
      shipmentPollingWorker.close(),
      smsWorker.close(),
      stockSyncWorker.close(),
      cleanupWorker.close(),
      thresholdWorker.close(),
      queue.close(),
      csvQueue.close(),
      emailQueue.close(),
      imageQueue.close(),
      paymentTimeoutQueue.close(),
      refundProcessorQueue.close(),
      returnWindowCloserQueue.close(),
      orderConfirmationQueue.close(),
      efaturaQueue.close(),
      shipmentPollingQueue.close(),
      smsQueue.close(),
      stockSyncQueue.close(),
      cleanupQueue.close(),
      thresholdQueue.close(),
    ]);
    await app.close();
    await closePool();
    throw error;
  }
}

const entrypointPath = process.argv[1];
const currentFilePath = fileURLToPath(import.meta.url);

if (entrypointPath === currentFilePath) {
  void startServer();
}
