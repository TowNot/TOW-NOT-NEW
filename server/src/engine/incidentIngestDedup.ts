import { getSharedRedis } from "../queue/redisClient";
import { logger } from "../logger";

/** Cluster-safe ingest dedup window (15 minutes). */
export const INCIDENT_INGEST_DEDUP_TTL_SEC = 900;

const INGEST_KEY_PREFIX = "incident:ingest:";

/** In-process fallback when Redis is unreachable (single-instance safety). */
const localIngestClaims = new Map<string, number>();

function pruneLocalClaims(now = Date.now()): void {
  const ttlMs = INCIDENT_INGEST_DEDUP_TTL_SEC * 1000;
  for (const [id, at] of localIngestClaims) {
    if (now - at > ttlMs) localIngestClaims.delete(id);
  }
}

/**
 * Claim first-seen ingest rights for an incident id (SET NX EX 900).
 * Returns false when another cluster member (or a recent local claim) already
 * holds the key — caller should skip ingest for that id.
 *
 * Fail-open on Redis errors so a down Redis does not block alerts.
 */
export async function claimIncidentIngest(incidentId: string): Promise<boolean> {
  const id = incidentId.trim();
  if (!id) return true;

  const key = `${INGEST_KEY_PREFIX}${id}`;
  try {
    const redis = getSharedRedis();
    const result = await redis.set(key, "1", "EX", INCIDENT_INGEST_DEDUP_TTL_SEC, "NX");
    if (result === "OK") {
      localIngestClaims.set(id, Date.now());
      return true;
    }
    return false;
  } catch (error) {
    logger.warn("Redis incident ingest dedup unavailable — using in-memory fallback", {
      incidentId: id,
      error: error instanceof Error ? error.message : String(error),
    });
    pruneLocalClaims();
    if (localIngestClaims.has(id)) return false;
    localIngestClaims.set(id, Date.now());
    return true;
  }
}
