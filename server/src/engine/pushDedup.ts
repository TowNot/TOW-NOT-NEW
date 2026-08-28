import type { Incident } from "../types/incident";
import { mergeLane } from "./incidentMerge";
import { logger } from "../logger";

/** Do not push incidents older than this (stale API rows / late ingest). */
export const PUSH_MAX_AGE_MS = 7 * 60 * 1000;

/** Hold concurrent / recent push locks this long. */
export const PUSH_DEDUP_TTL_MS = 10 * 60 * 1000;

const pendingPushLocks = new Set<string>();
const recentPushAt = new Map<string, number>();

function prunePushLocks(now = Date.now()): void {
  for (const [key, at] of recentPushAt) {
    if (now - at > PUSH_DEDUP_TTL_MS) {
      recentPushAt.delete(key);
      pendingPushLocks.delete(key);
    }
  }
}

/** ~100 m grid key scoped by merge lane — generic incident locks must not block accidents. */
export function googleMapsPushLockKey(incident: Incident): string {
  const { latitude: lat, longitude: lng } = incident.coordinates;
  const lane = mergeLane(incident);
  return `gmaps-push:${lat.toFixed(3)}:${lng.toFixed(3)}:${lane}`;
}

export function wazePushLockKey(incidentId: string): string {
  return `waze-push:${incidentId}`;
}

/**
 * Synchronously claim a push lock. Returns false if already pending or
 * pushed within the TTL — caller must skip sendProgressierPush.
 */
export function claimPushLock(key: string): boolean {
  prunePushLocks();
  if (pendingPushLocks.has(key) || recentPushAt.has(key)) {
    return false;
  }
  pendingPushLocks.add(key);
  recentPushAt.set(key, Date.now());
  return true;
}

export function releasePushLock(key: string): void {
  pendingPushLocks.delete(key);
  // Keep recentPushAt so TTL still blocks re-push after a failed claim window.
}

export function isIncidentTooOldForPush(
  incident: Incident,
  now = Date.now(),
): boolean {
  const ts = new Date(incident.timestamp).getTime();
  if (!Number.isFinite(ts)) return false;
  return now - ts > PUSH_MAX_AGE_MS;
}

export type PushClaimResult =
  | { ok: true; lockKey: string | null }
  | { ok: false; reason: string; lockKey?: string };

export type PushClaimOptions = {
  /** Bypass duplicate lock (e.g. incident → accident cluster upgrade). */
  bypassPushLock?: boolean;
};

/** Claim or refresh a push lock without checking for an existing holder. */
export function forceClaimPushLock(key: string): void {
  prunePushLocks();
  pendingPushLocks.add(key);
  recentPushAt.set(key, Date.now());
}

/**
 * Age + source-specific concurrent dedup before Progressier send.
 * Call synchronously before sendProgressierPush.
 */
export function claimIncidentPush(
  incident: Incident,
  options?: PushClaimOptions,
): PushClaimResult {
  if (isIncidentTooOldForPush(incident)) {
    return {
      ok: false,
      reason: "SKIPPED PUSH (Too old)",
    };
  }

  if (incident.source === "google_maps") {
    const lockKey = googleMapsPushLockKey(incident);
    if (options?.bypassPushLock) {
      forceClaimPushLock(lockKey);
      return { ok: true, lockKey };
    }
    if (!claimPushLock(lockKey)) {
      return {
        ok: false,
        reason: "SKIPPED PUSH (Duplicate concurrent lock)",
        lockKey,
      };
    }
    return { ok: true, lockKey };
  }

  if (incident.source === "waze") {
    const lockKey = wazePushLockKey(incident.id);
    if (!claimPushLock(lockKey)) {
      return {
        ok: false,
        reason: "SKIPPED PUSH (Duplicate Waze alert lock)",
        lockKey,
      };
    }
    return { ok: true, lockKey };
  }

  return { ok: true, lockKey: null };
}

export function logSkippedPush(incidentId: string, reason: string): void {
  logger.info(`[Notification Gate] ID: ${incidentId} | Decision: ${reason}`);
}
