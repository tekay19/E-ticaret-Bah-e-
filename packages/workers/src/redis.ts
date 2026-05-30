import { Redis } from "ioredis";
import { env } from "@bahce-shop/shared";

export function createRedisClient(connectionName?: string) {
  return new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    connectionName,
  });
}
