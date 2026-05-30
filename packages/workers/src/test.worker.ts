import type { Job } from "bullmq";
import { logger } from "@bahce-shop/shared";
import { BaseWorker } from "./base.worker.js";

export const TEST_QUEUE_NAME = "infrastructure";

type TestJobPayload = {
  createdAt: string;
};

export class TestWorker extends BaseWorker<TestJobPayload> {
  protected queueName = TEST_QUEUE_NAME;

  protected async handle(job: Job<TestJobPayload>) {
    logger.info(
      { jobId: job.id, payload: job.data },
      "test infrastructure job completed",
    );
  }
}
