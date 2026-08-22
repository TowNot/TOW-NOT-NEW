import { clerkClient, getAuth } from "@clerk/express";
import { Router } from "express";
import { logger } from "../logger";

const ZONE_IDS = new Set(["london", "hamilton", "mississauga", "brampton", "toronto"]);
const PUSH_ZONE_MODES = new Set(["current", "all"]);

export function createMeRouter(): Router {
  const router = Router();

  router.patch("/zone", async (req, res, next) => {
    try {
      const auth = getAuth(req);
      if (!auth.isAuthenticated || !auth.userId) {
        res.status(401).json({ error: "Unauthorized — sign in required" });
        return;
      }

      const selectedZoneIdRaw =
        typeof req.body?.selectedZoneId === "string" ? req.body.selectedZoneId.trim() : "";
      const pushZoneModeRaw =
        typeof req.body?.pushZoneMode === "string" ? req.body.pushZoneMode.trim() : "";

      const publicMetadata: Record<string, string> = {};

      if (selectedZoneIdRaw) {
        if (!ZONE_IDS.has(selectedZoneIdRaw)) {
          res.status(400).json({ error: "Unknown zone" });
          return;
        }
        publicMetadata.selectedZoneId = selectedZoneIdRaw;
      }

      if (pushZoneModeRaw) {
        if (!PUSH_ZONE_MODES.has(pushZoneModeRaw)) {
          res.status(400).json({ error: "Unknown push zone mode" });
          return;
        }
        publicMetadata.pushZoneMode = pushZoneModeRaw;
      }

      if (Object.keys(publicMetadata).length === 0) {
        res.status(400).json({ error: "Provide selectedZoneId and/or pushZoneMode" });
        return;
      }

      const existing = await clerkClient.users.getUser(auth.userId);
      await clerkClient.users.updateUser(auth.userId, {
        publicMetadata: {
          ...(existing.publicMetadata ?? {}),
          ...publicMetadata,
        },
      });

      res.json({
        ok: true,
        selectedZoneId:
          publicMetadata.selectedZoneId ??
          (typeof existing.publicMetadata?.selectedZoneId === "string"
            ? existing.publicMetadata.selectedZoneId
            : undefined),
        pushZoneMode:
          publicMetadata.pushZoneMode ??
          (typeof existing.publicMetadata?.pushZoneMode === "string"
            ? existing.publicMetadata.pushZoneMode
            : undefined),
      });
    } catch (error) {
      logger.warn("Failed to persist zone prefs on Clerk publicMetadata", {
        error: error instanceof Error ? error.message : String(error),
      });
      next(error);
    }
  });

  return router;
}
