import { clerkClient, getAuth } from "@clerk/express";
import { Router } from "express";
import { countUsersSelectingCity } from "../engine/activeMonitoredCities";
import { coldStartCityScrape } from "../engine/cityColdStart";
import { isKnownCityId } from "../engine/coverageZones";
import { logger } from "../logger";
import { upsertUserSelectedCity } from "../store/userPreferenceStore";

/** Any catalog city may be selected — scrapers follow Prisma demand. */
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
      if (!isKnownCityId(selectedZoneId)) {
        res.status(400).json({
          error: "Unknown zone id",
          selectedZoneId,
        });
        return;
      }

      const usersAlreadyOnCity = await countUsersSelectingCity(selectedZoneId);
      await upsertUserSelectedCity(auth.userId, selectedZoneId);

      const existing = await clerkClient.users.getUser(auth.userId);
      const nextMeta = { ...(existing.publicMetadata ?? {}), selectedZoneId };
      delete (nextMeta as Record<string, unknown>).pushZoneMode;

      await clerkClient.users.updateUser(auth.userId, {
        publicMetadata: nextMeta,
      });

      if (usersAlreadyOnCity === 0) {
        void coldStartCityScrape(selectedZoneId).catch((error) => {
          logger.warn("Cold-start scrape failed", {
            selectedZoneId,
            error: error instanceof Error ? error.message : String(error),
          });
        });
      }

      res.json({ ok: true, selectedZoneId, coldStart: usersAlreadyOnCity === 0 });
    } catch (error) {
      logger.warn("Failed to persist selectedZoneId on Clerk publicMetadata", {
        error: error instanceof Error ? error.message : String(error),
      });
      next(error);
    }
  });

  return router;
}
