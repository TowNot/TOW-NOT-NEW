import { clerkClient, getAuth } from "@clerk/express";
import { Router } from "express";
import { enabledCoverageZones } from "../engine/coverageZones";
import { logger } from "../logger";

/** Only zones that are ingest-enabled (London-only today). */
const ENABLED_ZONE_IDS = new Set(enabledCoverageZones().map((zone) => zone.id));

export function createMeRouter(): Router {
  const router = Router();

  router.patch("/zone", async (req, res, next) => {
    try {
      const auth = getAuth(req);
      if (!auth.isAuthenticated || !auth.userId) {
        res.status(401).json({ error: "Unauthorized — sign in required" });
        return;
      }

      const selectedZoneId =
        typeof req.body?.selectedZoneId === "string" ? req.body.selectedZoneId.trim() : "";
      if (!ENABLED_ZONE_IDS.has(selectedZoneId)) {
        res.status(400).json({
          error: "Zone not available (London-only mode)",
          allowed: [...ENABLED_ZONE_IDS],
        });
        return;
      }

      const existing = await clerkClient.users.getUser(auth.userId);
      const nextMeta = { ...(existing.publicMetadata ?? {}), selectedZoneId };
      delete (nextMeta as Record<string, unknown>).pushZoneMode;

      await clerkClient.users.updateUser(auth.userId, {
        publicMetadata: nextMeta,
      });

      res.json({ ok: true, selectedZoneId });
    } catch (error) {
      logger.warn("Failed to persist selectedZoneId on Clerk publicMetadata", {
        error: error instanceof Error ? error.message : String(error),
      });
      next(error);
    }
  });

  return router;
}
