import { EventEmitter } from "node:events";
import { config } from "../config";
import { mergeGoogleMapsRawType, mergeGoogleMapsZoom } from "../engine/googleMaps/googleMapsDisplay";
import {
  mergeSourceDetections,
  sourceDetectionsFromIncident,
} from "../engine/incidentMerge";
import { logger } from "../logger";
import type { Incident, IncidentSeverity } from "../types/incident";

export interface ClusterUpgradeEvent {
  previous: Incident;
  incoming: Incident;
  merged: Incident;
}

const SEVERITY_RANK: Record<IncidentSeverity, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

function higherSeverity(current: IncidentSeverity, incoming: IncidentSeverity): IncidentSeverity {
  return SEVERITY_RANK[incoming] > SEVERITY_RANK[current] ? incoming : current;
}

export class IncidentStore extends EventEmitter {
  private readonly incidents = new Map<string, Incident>();
  private pruneTimer: NodeJS.Timeout | null = null;
  private hardDeleteTimer: NodeJS.Timeout | null = null;

  start(): void {
    if (this.pruneTimer) return;
    this.pruneTimer = setInterval(() => this.pruneExpired(), 30_000);
    this.pruneTimer.unref();
    // Hourly hard-delete of stale rows (by first-seen timestamp). Does not
    // await I/O and must not block pollers / SSE — setInterval callback only.
    this.hardDeleteTimer = setInterval(() => {
      try {
        this.hardDeleteOlderThan(config.incidentHardDeleteMs);
      } catch (err) {
        logger.warn("Incident hard-delete sweeper failed", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }, config.incidentHardDeleteIntervalMs);
    this.hardDeleteTimer.unref();
  }

  stop(): void {
    if (this.pruneTimer) {
      clearInterval(this.pruneTimer);
      this.pruneTimer = null;
    }
    if (this.hardDeleteTimer) {
      clearInterval(this.hardDeleteTimer);
      this.hardDeleteTimer = null;
    }
  }

  upsert(
    incident: Incident,
    options?: { suppressPush?: boolean },
  ): Incident {
    const existing = this.incidents.get(incident.id);
    const isNew = !existing;
    const sourceDetections = mergeSourceDetections(
      existing?.sourceDetections,
      incident.sourceDetections ?? sourceDetectionsFromIncident(incident),
    );
    const primaryDetection = sourceDetections[0];
    const withExpiry: Incident = {
      ...incident,
      sourceDetections,
      source: primaryDetection?.source ?? incident.source,
      timestamp: primaryDetection?.detectedAt ?? existing?.timestamp ?? incident.timestamp,
      provider: primaryDetection?.provider ?? existing?.provider ?? incident.provider,
      audioUrl: incident.audioUrl ?? existing?.audioUrl,
      googleMapsZoom: mergeGoogleMapsZoom(existing?.googleMapsZoom, incident.googleMapsZoom),
      rawType: mergeGoogleMapsRawType(existing?.rawType, incident.rawType),
      expiresAt: incident.expiresAt || new Date(Date.now() + config.incidentTtlMs).toISOString(),
      severity: existing ? higherSeverity(existing.severity, incident.severity) : incident.severity,
      // suppressPush (e.g. CAD merge into an existing card) marks notified so
      // a later refresh cannot re-push the same row.
      notified:
        options?.suppressPush && isNew
          ? true
          : (existing?.notified ?? incident.notified),
    };
    this.incidents.set(withExpiry.id, withExpiry);
    logger.debug("[BROADCAST] Sending incident to client...", {
      id: withExpiry.id,
      title: withExpiry.title,
      source: withExpiry.source,
      isNew,
      suppressPush: Boolean(options?.suppressPush),
    });
    this.emit("upsert", withExpiry);
    if (isNew && !options?.suppressPush) this.emit("created", withExpiry);
    return withExpiry;
  }

  emitClusterUpgrade(event: ClusterUpgradeEvent): void {
    this.emit("clusterUpgrade", event);
  }

  markNotified(id: string): void {
    const incident = this.incidents.get(id);
    if (!incident || incident.notified) return;
    const updated: Incident = { ...incident, notified: true };
    this.incidents.set(id, updated);
    this.emit("upsert", updated);
  }

  getActive(): Incident[] {
    this.pruneExpired();
    return [...this.incidents.values()].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
  }

  getById(id: string): Incident | undefined {
    this.pruneExpired();
    return this.incidents.get(id);
  }

  pruneExpired(now = Date.now()): Incident[] {
    const expired: Incident[] = [];
    for (const [id, incident] of this.incidents) {
      if (new Date(incident.expiresAt).getTime() <= now) {
        this.incidents.delete(id);
        expired.push(incident);
        this.emit("expire", incident);
      }
    }
    if (expired.length > 0) {
      logger.info("Expired incidents pruned", { count: expired.length });
    }
    return expired;
  }

  /**
   * Hard-delete incidents whose first-seen `timestamp` is older than maxAgeMs.
   * Uses UTC epoch ms from ISO-8601 timestamps (consistent across zones).
   * Emits `expire` so SSE clients drop the row without blocking the event loop.
   * (There is no SQL DB — this is the in-memory store equivalent of
   * DELETE WHERE created_at < NOW() - INTERVAL '24 hours'.)
   */
  hardDeleteOlderThan(maxAgeMs: number, now = Date.now()): Incident[] {
    const cutoff = now - maxAgeMs;
    const removed: Incident[] = [];
    for (const [id, incident] of this.incidents) {
      const createdMs = Date.parse(incident.timestamp);
      if (!Number.isFinite(createdMs) || createdMs > cutoff) continue;
      this.incidents.delete(id);
      removed.push(incident);
      this.emit("expire", incident);
    }
    if (removed.length > 0) {
      logger.info("Hard-deleted stale incidents", {
        count: removed.length,
        maxAgeHours: Math.round(maxAgeMs / 3_600_000),
      });
    }
    return removed;
  }
}
