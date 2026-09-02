import { getAuth } from "@clerk/express";
import type { NextFunction, Request, Response } from "express";

const ADMIN_CLERK_USER_IDS = new Set(
  (process.env.ADMIN_CLERK_USER_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean),
);

/** Restrict route to Clerk user ids listed in ADMIN_CLERK_USER_IDS. */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const auth = getAuth(req);
  if (!auth.userId || !ADMIN_CLERK_USER_IDS.has(auth.userId)) {
    res.status(403).json({ error: "Forbidden — admin only" });
    return;
  }
  next();
}
