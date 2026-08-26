import Redis from "ioredis";

/**
 * Shared Redis factory for BullMQ Queue + Worker.
 * BullMQ requires `maxRetriesPerRequest: null` on ioredis.
 *
 * Prefer `REDIS_URL` (Railway Redis, Upstash, etc.). Falls back to local
 * Redis defaults when unset.
 */
export function createRedisConnection(): Redis {
  const url = process.env.REDIS_URL?.trim();
  if (url) {
    return new Redis(url, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
  }

  const host = process.env.REDIS_HOST?.trim() || "127.0.0.1";
  const portRaw = Number(process.env.REDIS_PORT ?? 6379);
  const port = Number.isFinite(portRaw) && portRaw > 0 ? portRaw : 6379;

  return new Redis({
    host,
    port,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
}
