import { getAuth } from "@clerk/express";
import type { NextFunction, Request, Response } from "express";
import { config } from "../config";

/**
 * Require a Clerk session. Use after `clerkMiddleware()`.
 * Returns 401 JSON (API-friendly) instead of the deprecated `requireAuth()` redirect.
 */
export function requireClerkAuth(req: Request, res: Response, next: NextFunction): void {
  if (!config.clerkPublishableKey || !config.clerkSecretKey) {
    res.status(503).json({ error: "Authentication is not configured" });
    return;
  }

  const auth = getAuth(req);
  if (!auth.isAuthenticated) {
    res.status(401).json({ error: "Unauthorized — sign in required" });
    return;
  }
  next();
}
