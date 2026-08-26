import type Redis from "ioredis";
import { createRedisConnection } from "./connection";

let shared: Redis | null = null;

/** Singleton Redis client for app-level SET/GET (dedup, optional cache). */
export function getSharedRedis(): Redis {
  if (!shared) {
    shared = createRedisConnection();
  }
  return shared;
}

export async function closeSharedRedis(): Promise<void> {
  if (!shared) return;
  await shared.quit();
  shared = null;
}
