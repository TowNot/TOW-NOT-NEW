import { getAuth } from "@clerk/express";
import type { NextFunction, Request, Response } from "express";
import {
  readSessionTokenFromRequest,
  SESSION_REPLACED_MESSAGE,
} from "../lib/sessionToken";
import { userSessionTokenMatches } from "../store/userPreferenceStore";

function isSessionClaimRoute(req: Request): boolean {
  return (
    req.method === "POST" &&
    (req.path === "/session/claim" || req.originalUrl.includes("/session/claim"))
  );
}

/**
 * Enforce single active device session. Skips POST /session/claim so new logins always succeed.
 */
export async function requireMatchingSession(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (isSessionClaimRoute(req)) {
    next();
    return;
  }

  const auth = getAuth(req);
  if (!auth.isAuthenticated || !auth.userId) {
    res.status(401).json({ error: "Unauthorized — sign in required" });
    return;
  }

  const presented = readSessionTokenFromRequest(req.headers, req.query.session);
  const matches = await userSessionTokenMatches(auth.userId, presented);
  if (!matches) {
    res.status(409).json({
      code: "session_replaced",
      error: SESSION_REPLACED_MESSAGE,
    });
    return;
  }

  next();
}
