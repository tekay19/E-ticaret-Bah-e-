import { Job, Queue, Worker, type JobsOptions } from "bullmq";
import { env, logger } from "@bahce-shop/shared";
import { createRedisClient } from "./redis.js";

const defaultJobOptions: JobsOptions = {
  attempts: 5,
  backoff: {
    type: "exponential",
    delay: 1000,
  },
  removeOnComplete: 1000,
  removeOnFail: 1000,
};

export function createQueue<T>(queueName: string) {
  return new Queue<T>(queueName, {
    connection: createRedisClient(`queue:${queueName}`),
    defaultJobOptions,
  });
}

export abstract class BaseWorker<T> {
  protected abstract queueName: string;

  protected abstract handle(job: Job<T>): Promise<unknown>;

  start() {
    return new Worker<T>(
      this.queueName,
      async (job) => {
        logger.info(
          { jobId: job.id, queue: this.queueName },
          "processing worker job",
        );
        return this.handle(job);
      },
      {
        connection: createRedisClient(`worker:${this.queueName}`),
        concurrency: 1,
      },
    );
  }

  protected getRedisUrl() {
    return env.REDIS_URL;
  }
}
