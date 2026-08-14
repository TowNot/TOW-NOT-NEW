import { EventEmitter } from "node:events";
import { config } from "../config";
import { logger } from "../logger";
import type { Incident } from "../types/incident";

export class IncidentStore extends EventEmitter {
  private readonly incidents = new Map<string, Incident>();
  private pruneTimer: NodeJS.Timeout | null = null;

  start(): void {
    if (this.pruneTimer) return;
    this.pruneTimer = setInterval(() => this.pruneExpired(), 30_000);
    this.pruneTimer.unref();
  }

  stop(): void {
    if (this.pruneTimer) {
      clearInterval(this.pruneTimer);
      this.pruneTimer = null;
    }
  }

  upsert(incident: Incident): Incident {
    const isNew = !this.incidents.has(incident.id);
    const withExpiry: Incident = {
      ...incident,
      expiresAt: incident.expiresAt || new Date(Date.now() + config.incidentTtlMs).toISOString(),
    };
    this.incidents.set(withExpiry.id, withExpiry);
    this.emit("upsert", withExpiry);
    if (isNew) this.emit("created", withExpiry);
    return withExpiry;
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
}
