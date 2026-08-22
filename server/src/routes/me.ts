import { clerkClient, getAuth } from "@clerk/express";
import { Router } from "express";
import { COVERAGE_ZONE_IDS } from "../engine/coverageZones";
import { logger } from "../logger";

const ZONE_IDS = new Set(COVERAGE_ZONE_IDS);

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
      if (!ZONE_IDS.has(selectedZoneId)) {
        res.status(400).json({ error: "Unknown zone" });
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
